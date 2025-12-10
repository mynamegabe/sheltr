from sqlalchemy import Column, Integer, String, Float, DateTime, BigInteger
from database import Base
import datetime
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    type = Column(String(50), nullable=False) # e.g. "hazard", "info"
    label = Column(String(100), nullable=False) # e.g. "Pothole"
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    details = Column(String(500), nullable=True)
    timestamp = Column(BigInteger, nullable=False) # Unix timestamp to match frontend
    confirmations = Column(Integer, default=1)
    denials = Column(Integer, default=0)

    @property
    def coordinates(self):
        return [self.longitude, self.latitude]

class AccessibilitySubmission(Base):
    __tablename__ = "accessibility_submissions"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    issue_type = Column(String(100), nullable=False)
    description = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
