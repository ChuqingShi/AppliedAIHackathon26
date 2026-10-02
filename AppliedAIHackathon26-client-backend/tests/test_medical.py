from digest.medical import expert_evidence, expert_side, statements, visit_status, work_status


def test_pt_discharge_with_residual_pain_is_a_discharge():
    # "Residual" alone would mean not recovered; an explicit discharge from therapy outranks it.
    body = ("STATUS AT DISCHARGE\nLeft shoulder symptoms have improved. Residual pain remains.\n"
            "DISPOSITION\nDischarge from physical therapy documented on 09/14/2023.")
    assert visit_status("Physical therapy discharge note", body)[0] == "discharged"


def test_er_discharge_home_is_not_a_recovery():
    body = ("REASSESSMENT\nPatient continues to report neck and left shoulder soreness.\n"
            "DISPOSITION\nDischarged home on 04/24/2023.")
    category, evidence = visit_status("Nursing reassessment and discharge", body)
    assert category == "not_recovered"
    assert evidence == "Patient continues to report neck and left shoulder soreness."  # heading not glued on


def test_continuing_care_outranks_improvement():
    body = "SUBJECTIVE\nNeck pain has improved.\nPLAN\nContinue the established care plan."
    assert visit_status("Daily chiropractic SOAP note", body)[0] == "not_recovered"


def test_imaging_is_diagnostic_with_its_impression():
    body = "STUDY\nElectrodiagnostic evaluation.\nIMPRESSION\nBilateral L5-S1 radiculopathy.\nDOCUMENTATION\nx"
    assert visit_status("EMG/NCV: lower extremities", body) == ("diagnostic", "Bilateral L5-S1 radiculopathy.")


def test_work_status_section():
    body = "CARE AND PLAN\nContinue care.\nWORK STATUS\nTotally disabled from his usual occupation.\nClinician / record author: X"
    assert work_status(body) == "Totally disabled from his usual occupation."


def test_bullets_without_periods_become_separate_statements():
    text = '" Status Post Cervical Strain, objectively resolved\n" Status Post Lumbar Strain, objectively resolved'
    assert statements(text) == ["Status Post Cervical Strain, objectively resolved",
                                "Status Post Lumbar Strain, objectively resolved"]


def test_filer_side_is_the_first_attorneys_for_line():
    # The defense files the report and then serves plaintiff's attorneys, who are named later.
    assert expert_side("Yours, etc. MILBER MAKRIS\nAttorneys for Defendants\n...\nAttorneys for Plaintiff") == "defense"


def test_expert_evidence_ignores_citations_and_ocr_glued_words():
    doc = {"id": 56, "title": "ime orthopedic hostin", "doc_date": "2026-04-09", "pages": [
        {"page": 8, "text": "according to the AMA Guides to the Evaluation of Permanent Impairment, 5th Edition."},
        {"page": 11, "text": "Attorneys for Defendants\n1. Neck sprain - resolved 2. Low back sprain - resolved.\n"
                             "In conclusion, the MRI revealsno recent traumatic injury."},
    ]}
    found = [(e["page"], e["recovery"], e["quote"]) for e in expert_evidence(doc)]
    assert found == [(11, "resolved", "Neck sprain - resolved."),
                     (11, "resolved", "Low back sprain - resolved."),
                     (11, "no_traumatic_injury", "In conclusion, the MRI revealsno recent traumatic injury.")]
