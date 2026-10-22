import pytest
from unittest.mock import MagicMock, patch, ANY
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
@patch('services.embedding_service.get_embedding')
def test_process_syllabus_pdf_success(mock_get_embedding, mock_storage, mock_pymupdf, mock_db):
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
    
    # Mock embedding function
    mock_get_embedding.return_value = [0.1, 0.2, 0.3]
    
    # Execute
    process_syllabus_pdf(syllabus_id, file_ref, db_factory)
    
    # Asserts
    # Should clear existing chunks
    db.execute.assert_any_call(
        ANY, # text(...)
        {"syllabus_id": syllabus_id}
    )
    
    # Should commit
    assert db.commit.call_count >= 1

@patch('services.embedding_service.StorageService')
def test_process_syllabus_pdf_file_not_found(mock_storage, mock_db):
    db, db_factory = mock_db
    syllabus_id = uuid4()
    
    mock_path = MagicMock()
    mock_path.exists.return_value = False
    mock_storage.get_file_path.return_value = mock_path
    
    with pytest.raises(FileNotFoundError):
        process_syllabus_pdf(syllabus_id, "1/missing.pdf", db_factory)
