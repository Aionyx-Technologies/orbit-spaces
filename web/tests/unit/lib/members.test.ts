import { describe, expect, it } from "vitest";

import { ownerIdOf } from "@/lib/members";

const alex = { user_id: "a", display_name: "Alex", is_you: true };
const blake = { user_id: "b", display_name: "Blake", is_you: false };
const casey = { user_id: "c", display_name: "Casey", is_you: false };

describe("ownerIdOf", () => {
  it("is you when you created the space", () => {
    expect(ownerIdOf({ is_creator: true, members: [blake, alex] })).toBe("a");
  });

  it("finds the person the space says it is shared by", () => {
    expect(
      ownerIdOf({ is_creator: false, owner_name: "Blake", members: [alex, blake, casey] }),
    ).toBe("b");
  });

  it("does not guess when two members share the owner's name", () => {
    const otherBlake = { ...casey, display_name: "Blake" };
    expect(
      ownerIdOf({ is_creator: false, owner_name: "Blake", members: [alex, blake, otherBlake] }),
    ).toBeNull();
  });

  it("does not guess when the owner is not known or no longer here", () => {
    expect(ownerIdOf({ is_creator: false, members: [alex, blake] })).toBeNull();
    expect(ownerIdOf({ is_creator: false, owner_name: null, members: [alex, blake] })).toBeNull();
    expect(ownerIdOf({ is_creator: false, owner_name: "Dana", members: [alex, blake] })).toBeNull();
  });

  it("never names you as the owner of somebody else's space", () => {
    expect(ownerIdOf({ is_creator: false, owner_name: "Alex", members: [alex, blake] })).toBeNull();
  });
});
