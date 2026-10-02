from patient_id import find_id_document, picture, portrait


def doc(id, name, folder="06 Correspondence", received="2024-01-01", ctype="application/pdf"):
    return {"id": id, "name": name, "parent": {"name": folder}, "received_at": received, "content_type": ctype}


def test_finds_the_id_by_its_file_name():
    found = find_id_document([doc(1, "demand-letter.pdf"), doc(2, "01-intake__created__photo-id.pdf")])
    assert found["docId"] == 2
    assert "names an identity document" in found["why"][0]


def test_knows_the_usual_names_for_an_id():
    for name in ("photo-id.pdf", "Photo_ID.jpg", "drivers-license.pdf", "driver's licence.pdf", "passport.pdf", "state-id.png"):
        assert find_id_document([doc(1, name)]) is not None, name


def test_needs_a_name_that_says_id():
    # A picture in the intake folder isn't the patient's ID just for being there.
    assert find_id_document([doc(1, "scene-photo.jpg", folder="01 Intake", ctype="image/jpeg")]) is None
    assert find_id_document([]) is None


def test_skips_files_it_cannot_picture():
    assert find_id_document([doc(1, "photo-id-notes.txt", ctype="text/plain")]) is None


def test_prefers_one_filed_in_intake_then_the_newest():
    docs = [doc(1, "passport.pdf", folder="06 Correspondence", received="2026-01-01"),
            doc(2, "photo-id.pdf", folder="01 Intake and Retainer", received="2023-05-07"),
            doc(3, "photo-id-old.pdf", folder="01 Intake and Retainer", received="2022-01-01")]
    found = find_id_document(docs)
    assert found["docId"] == 2  # in intake beats newer elsewhere; newest within intake
    assert any("Intake" in w for w in found["why"])


def test_an_image_file_is_its_own_picture(tmp_path):
    f = tmp_path / "id.jpg"
    f.write_bytes(b"not really a jpeg")
    assert picture(str(f)) == (b"not really a jpeg", "jpg")


def test_no_face_means_no_portrait():
    import cv2
    import numpy as np

    blank = cv2.imencode(".jpg", np.full((200, 300, 3), 255, np.uint8))[1].tobytes()
    assert portrait(blank) is None
    assert portrait(b"not an image") is None
