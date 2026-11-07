from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.event import Event
from ..models.organization import Organization

class DashboardService:
    def __init__(self, session: Session):
        self.session = session

    def summary(self):
        organizations = list(self.session.scalars(select(Organization)))
        events = list(self.session.scalars(select(Event).order_by(Event.starts_at.asc())))
        now = datetime.now(timezone.utc)
        published = [event for event in events if event.status == "published"]
        return {
            "activeOrganizations": sum(organization.status == "active" for organization in organizations),
            "publishedEvents": len(published),
            "upcomingEvents": sum(event.starts_at > now for event in published),
            "draftEvents": sum(event.status == "draft" for event in events),
            "nextEvents": published[:4],
        }
