class AdminError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class NotFoundError(AdminError):
    def __init__(self, message: str):
        super().__init__(message, 404)

class ConflictError(AdminError):
    def __init__(self, message: str):
        super().__init__(message, 409)

class InvalidInputError(AdminError):
    def __init__(self, message: str):
        super().__init__(message, 422)

class UnauthorizedError(AdminError):
    def __init__(self, message: str = "Administrator authentication is required."):
        super().__init__(message, 401)

class ServiceUnavailableError(AdminError):
    def __init__(self, message: str):
        super().__init__(message, 503)
