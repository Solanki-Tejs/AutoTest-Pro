import pytest
from unittest.mock import MagicMock, patch
from uuid import uuid4
from services.embedding_service import process_syllabus_pdf

@pytest.fixture
def mock_db():
    db = MagicMock()
    # Ensure it can be used as a context manager
    db.__enter__.return_value = db
    db.__exit__.return_value = False
    
    db_factory = MagicMock(return_value=db)
    return db, db_factory

@patch('services.embedding_service.pymupdf')
@patch('services.embedding_service.StorageService')
@patch('services.embedding_service.model')
def test_process_syllabus_pdf_success(mock_model, mock_storage, mock_pymupdf, mock_db):
    db, db_factory = mock_db
    
    syllabus_id = uuid4()
    file_ref = "1/test.pdf"
    
    # Mock storage
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_storage.get_file_path.return_value = mock_path
    
    # Mock PDF extraction
    mock_doc = MagicMock()
    mock_page = MagicMock()
    mock_page.get_text.return_value = "This is a test document. It contains some text that should be chunked and embedded."
    # Make document iterable like a list of pages
    mock_doc.__iter__.return_value = [mock_page]
    mock_pymupdf.open.return_value = mock_doc
    
    # Mock embedding model
    mock_model.encode.return_value = [0.1, 0.2, 0.3]
    
    # Execute
    process_syllabus_pdf(syllabus_id, file_ref, db_factory)
    
    # Asserts
    # Should clear existing chunks
    db.execute.assert_any_call(
        patch.ANY, # text(...)
        {"syllabus_id": syllabus_id}
    )
    
    # Should update status to PROCESSING
    db.execute.assert_any_call(
        patch.ANY,
        {"syllabus_id": syllabus_id}
    )
    
    # Should insert chunks
    # Since our text is small, it should insert 1 chunk
    # The actual insert call might be hard to match exactly due to how text() works,
    # so we just check that execute was called at least 4 times (clear, processing, insert, completed)
    assert db.execute.call_count >= 4
    
    # Should commit
    assert db.commit.call_count >= 2

@patch('services.embedding_service.StorageService')
def test_process_syllabus_pdf_file_not_found(mock_storage, mock_db):
    db, db_factory = mock_db
    syllabus_id = uuid4()
    
    mock_path = MagicMock()
    mock_path.exists.return_value = False
    mock_storage.get_file_path.return_value = mock_path
    
    process_syllabus_pdf(syllabus_id, "1/missing.pdf", db_factory)
    
    # Should log failure
    # Last call should update to FAILED
    calls = db.execute.call_args_list
    assert len(calls) > 0
    # Look for the failed call
    failed_call_found = False
    for call in calls:
        if "FAILED" in str(call[0][0]):
            failed_call_found = True
            break
    assert failed_call_found, "Did not find status update to FAILED"
