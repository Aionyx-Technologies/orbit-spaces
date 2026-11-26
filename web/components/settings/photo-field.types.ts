import type { Me } from "@/lib/api.types";

export type PhotoFieldProps = Readonly<{
  name: string;
  avatarUrl: string | null;
  onChanged: (me: Me) => void;
}>;
