"""The patient ID: finding the client's identity document in a matter and cutting
their portrait out of it, so the dashboard can show who the patient is.

It works in three steps, each its own function so it can be tested and tuned:

  1. find_id_document()  which synced document is the patient's photo ID
  2. picture()           that document as an image (a scanned ID is one embedded
                         JPEG; anything else is its first page rendered)
  3. portrait()          the face on it, cropped to a passport-style 3:4 frame

summary() runs all three for a matter and says what it found and why
(GET /case/patient-id). Nothing here calls Clio; it reads what sync.py stored.

Who may see what is decided by the dashboard, not here: the firm gets the ID
document and the portrait, a medical provider only the portrait (with
face_only, so a picture without a face is never handed over instead), and the
client neither.
"""
import os
import re

from db import connect

# ---- 1. Finding the ID document ----

# A file name that says it is an identity document. This is what qualifies a document.
ID_NAME = re.compile(r"photo[-_ ]?id|identification|driver'?s?[-_ ]?licen[cs]e|passport|state[-_ ]?id", re.I)
# Folders an ID is usually filed in. Used to prefer one qualifying document over another.
ID_FOLDER = re.compile(r"intake|identity|identification|client", re.I)
# File types we can get a picture out of.
PICTURE_TYPES = ("application/pdf", "image/")


def find_id_document(docs: list[dict]) -> dict | None:
    """The patient's photo ID among a matter's documents (Clio document records),
    or None. A document qualifies when its file name says it is an ID and its
    file type is one we can picture; among several, one filed in an intake or
    identity folder wins, then the most recently received. Returns the document
    with the reasons it was chosen."""
    candidates = []
    for d in docs:
        name = d.get("name") or ""
        ctype = d.get("content_type") or ""
        if not ID_NAME.search(name) or (ctype and not ctype.startswith(PICTURE_TYPES)):
            continue
        folder = (d.get("parent") or {}).get("name") or ""
        candidates.append((bool(ID_FOLDER.search(folder)), d.get("received_at") or "", d, folder))
    if not candidates:
        return None
    in_folder, received, d, folder = max(candidates, key=lambda c: (c[0], c[1]))
    why = [f'file name "{d.get("name")}" names an identity document']
    if in_folder:
        why.append(f'filed in "{folder}"')
    if len(candidates) > 1:
        why.append(f"chosen over {len(candidates) - 1} other ID document(s): {'in an ID folder, then ' if in_folder else ''}most recent")
    return {"docId": d["id"], "name": d.get("name"), "folder": folder or None, "receivedAt": received or None, "why": why}


# ---- 2. The document as a picture ----

def document_path(doc_id: int) -> str:
    """Where sync.py saved the document. LookupError if it hasn't been downloaded."""
    with connect() as conn:
        row = conn.execute("SELECT path FROM doc_files WHERE doc_id=?", (doc_id,)).fetchone()
    if not row or not os.path.isfile(row["path"]):
        raise LookupError("That document has not been downloaded. Re-sync without --no-files.")
    return row["path"]


def picture(path: str) -> tuple[bytes, str]:
    """A document as an image: (bytes, extension). A PDF gives its first embedded
    image (a scanned ID is one JPEG), or its first page rendered if it has none;
    an image file is returned as it is."""
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    if ext in ("jpg", "jpeg", "png", "webp"):
        with open(path, "rb") as f:
            return f.read(), ext
    import pymupdf  # only pictures need it

    with pymupdf.open(path) as pdf:
        if not pdf.page_count:
            raise LookupError("That document has no pages")
        images = pdf[0].get_images(full=True)
        if images:
            img = pdf.extract_image(images[0][0])
            return img["image"], img["ext"]
        return pdf[0].get_pixmap(dpi=110).tobytes("png"), "png"


# ---- 3. The portrait ----

# How the portrait is framed around the face: FRAME_WIDTH times the face's width
# (1.4 is a close head-and-shoulders crop), FRAME_RATIO tall (3:4, like a passport
# photo), with a point just above the face's centre (its eyes, roughly) FACE_HEIGHT
# of the way down the frame, which leaves room for the shoulders.
FRAME_WIDTH = 1.4
FRAME_RATIO = 4 / 3
FACE_HEIGHT = 0.42


def find_face(data: bytes) -> tuple[tuple[int, int, int, int], tuple[int, int]] | None:
    """The largest face in an image, as ((x, y, w, h), (image width, height)), or None.
    Uses OpenCV's built-in face detector (opencv-python-headless < 5: version 5
    dropped the built-in face models)."""
    import cv2
    import numpy as np

    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    if not len(faces):
        return None
    x, y, w, h = (int(v) for v in max(faces, key=lambda f: f[2] * f[3]))
    return (x, y, w, h), (img.shape[1], img.shape[0])


def portrait(data: bytes) -> bytes | None:
    """The face in an image, cropped to the portrait frame, as JPEG; None if no face."""
    import cv2
    import numpy as np

    found = find_face(data)
    if not found:
        return None
    (fx, fy, fw, fh), (w, h) = found
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    cw = min(int(fw * FRAME_WIDTH), w)
    ch = min(int(cw * FRAME_RATIO), h)
    # centred on the face, then moved back inside the image if it runs off an edge
    x0 = min(max(int(fx + fw / 2 - cw / 2), 0), w - cw)
    y0 = min(max(int(fy + fh * 0.45 - ch * FACE_HEIGHT), 0), h - ch)
    ok, out = cv2.imencode(".jpg", img[y0:y0 + ch, x0:x0 + cw], [cv2.IMWRITE_JPEG_QUALITY, 92])
    return out.tobytes() if ok else None


# ---- All three, for a matter ----

def summary(matter_id: int | None = None) -> dict:
    """What the patient ID is for a matter: the document found and why, and whether
    a face was found on it. With no matter_id, the most recently synced matter."""
    import json

    with connect() as conn:
        if matter_id is None:
            row = conn.execute("SELECT matter_id FROM raw_records WHERE kind='matter' ORDER BY changed_at DESC LIMIT 1").fetchone()
            if not row:
                raise LookupError("No matter has been synced yet. Run: python sync.py <matter_id>")
            matter_id = row["matter_id"]
        docs = [json.loads(r["data"]) for r in
                conn.execute("SELECT data FROM raw_records WHERE kind='document' AND matter_id=?", (matter_id,))]
    doc = find_id_document(docs)
    out = {"matterId": matter_id, "document": doc, "face": None, "portrait": None}
    if not doc:
        return out
    try:
        found = find_face(picture(document_path(doc["docId"]))[0])
    except LookupError as e:
        out["face"] = {"found": False, "reason": str(e)}
        return out
    if found:
        (x, y, w, h), size = found
        out["face"] = {"found": True, "box": {"x": x, "y": y, "width": w, "height": h}, "imageSize": {"width": size[0], "height": size[1]}}
        out["portrait"] = f"/documents/{doc['docId']}/photo"
    else:
        out["face"] = {"found": False, "reason": "No face detected in the document's picture"}
    return out
