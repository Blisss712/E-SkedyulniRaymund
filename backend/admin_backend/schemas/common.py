from pydantic import BaseModel

class MessageResponse(BaseModel):
    message: str

class ConflictResponse(BaseModel):
    conflict: bool
    event: dict | None = None

class OrganizationResponse(BaseModel):
    id: str
    name: str
    description: str
    contactEmail: str
    phone: str
    timezone: str
    address: str
    category: str
    status: str
    createdAt: str

class EventResponse(BaseModel):
    id: str
    organizationId: str
    title: str
    description: str
    startsAt: str
    endsAt: str
    location: str
    capacity: int
    registrationDeadline: str
    visibility: str
    recurrence: str
    repeatUntil: str
    status: str
    createdAt: str
