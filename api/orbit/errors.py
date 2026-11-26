from __future__ import annotations


class OrbitError(Exception):
    code = "error"
    status = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidInput(OrbitError):
    code = "invalid_input"
    status = 422


class TooLong(InvalidInput):
    code = "too_long"


class NotFound(OrbitError):
    code = "not_found"
    status = 404


class SpaceNotFound(NotFound):
    code = "space_not_found"


class ItemNotFound(NotFound):
    code = "item_not_found"


class FactNotFound(NotFound):
    code = "fact_not_found"


class InviteNotFound(NotFound):
    code = "invite_not_found"


class NotAMember(OrbitError):
    code = "not_a_member"
    status = 403


class Forbidden(OrbitError):
    code = "forbidden"
    status = 403


class Unauthenticated(OrbitError):
    code = "unauthenticated"
    status = 401


class LimitReached(OrbitError):
    code = "limit_reached"
    status = 409


class AiUsesExhausted(OrbitError):
    code = "ai_uses_exhausted"
    status = 402


class Conflict(OrbitError):
    code = "conflict"
    status = 409


class FactNameTaken(Conflict):
    code = "fact_name_taken"


class InviteUnusable(Conflict):
    code = "invite_unusable"


class AlreadySubscribed(Conflict):
    code = "already_subscribed"


class NoBillingAccount(Conflict):
    code = "no_billing_account"


class PackNotNeeded(Conflict):
    code = "pack_not_needed"


class BadSignature(OrbitError):
    code = "bad_signature"
    status = 400


class RateLimited(OrbitError):
    code = "rate_limited"
    status = 429


class Unavailable(OrbitError):
    code = "unavailable"
    status = 503


class BillingUnavailable(Unavailable):
    code = "billing_unavailable"


class AmbiguousSpace(OrbitError):
    code = "ambiguous_space"
    status = 422

    def __init__(self, message: str, spaces: list[tuple[str, str]]) -> None:
        super().__init__(message)
        self.spaces = spaces
