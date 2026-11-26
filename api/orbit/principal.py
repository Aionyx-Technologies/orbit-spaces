from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from orbit.services.context import Actor


@dataclass(frozen=True)
class Principal:
    user_id: str
    client_name: str

    def actor(self) -> Actor:
        return Actor.assistant(self.user_id, self.client_name)


PrincipalResolver = Callable[[], Principal]
