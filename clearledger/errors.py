class LedgerError(Exception):
    """A safe, public error without input contents or internal paths."""

    status = 422
    code = "invalid_input"


class Conflict(LedgerError):
    status = 409
    code = "batch_conflict"


class NotFound(LedgerError):
    status = 404
    code = "not_found"


class Unavailable(LedgerError):
    status = 503
    code = "storage_unavailable"
