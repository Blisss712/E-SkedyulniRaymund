
from pydantic import BaseModel


class OrganizationMembershipResponse(BaseModel):
    organizationId: str
    organizationName: str
    userId: str
    joinedAt: str
    message: str
