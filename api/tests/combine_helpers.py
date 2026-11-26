from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from orbit.llm import CombineFailed, FactInput, ItemInput
from orbit.space_templates import SpaceTemplate

DEFAULT_PLAN = "Stay at Hotel 2.\n\nTo settle\n- Check-in time"


@dataclass
class Call:
    memory: list[FactInput]
    items: list[ItemInput]
    instruction: str | None
    omitted: int
    template: SpaceTemplate | None = None


@dataclass
class FakeCombiner:
    text: str = DEFAULT_PLAN
    error: CombineFailed | None = None
    on_call: Callable[[], None] | None = None
    calls: list[Call] = field(default_factory=list)

    def __call__(
        self,
        memory: Sequence[FactInput],
        items: Sequence[ItemInput],
        instruction: str | None,
        omitted_items: int = 0,
        template: SpaceTemplate | None = None,
    ) -> str:
        self.calls.append(Call(list(memory), list(items), instruction, omitted_items, template))
        if self.on_call is not None:
            self.on_call()
        if self.error is not None:
            raise self.error
        return self.text
