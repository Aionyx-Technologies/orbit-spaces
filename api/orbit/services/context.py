from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from orbit.billing import BillingGateway
from orbit.config import Settings
from orbit.email import EmailSender, Mailer, default_sender
from orbit.events import Broadcaster
from orbit.limits import COMBINE_MAX_CONCURRENT
from orbit.llm import Combiner, TemplateDrafter
from orbit.ratelimit import InFlight, RateLimiter
from orbit.security import Signer
from orbit.services.notify import Notifier
from orbit.timeutil import utcnow

AUTHOR_PERSON = "person"
AUTHOR_ASSISTANT = "assistant"
AUTHOR_ORBIT = "orbit"
VIA_WEB = "web"
VIA_ORBIT = "orbit"
VIA_ORBIT_SUGGESTION = "orbit-suggestion"

KIND_NOTE = "note"
KIND_PLAN = "plan"


@dataclass(frozen=True)
class Actor:
    user_id: str
    via: str
    author_kind: str

    @classmethod
    def web(cls, user_id: str) -> Actor:
        return cls(user_id=user_id, via=VIA_WEB, author_kind=AUTHOR_PERSON)

    @classmethod
    def assistant(cls, user_id: str, client_name: str) -> Actor:
        return cls(user_id=user_id, via=client_name, author_kind=AUTHOR_ASSISTANT)


@dataclass
class Env:
    settings: Settings
    clock: Callable[[], datetime] = utcnow
    sender: EmailSender | None = None
    llm: Combiner | None = None
    drafter: TemplateDrafter | None = None
    billing: BillingGateway | None = None
    signer: Signer = field(init=False)
    limiter: RateLimiter = field(init=False)
    mailer: Mailer = field(init=False)
    events: Broadcaster = field(init=False)
    notifier: Notifier = field(init=False)
    combines: InFlight = field(init=False)

    def __post_init__(self) -> None:
        self.signer = Signer(self.settings.secret_key, self.clock)
        self.limiter = RateLimiter(self.clock)
        self.mailer = Mailer(self.sender or default_sender(self.settings), self.clock)
        self.events = Broadcaster()
        self.notifier = Notifier(self.settings, self.mailer, self.clock)
        self.combines = InFlight(COMBINE_MAX_CONCURRENT)

    def now(self) -> datetime:
        return self.clock()
