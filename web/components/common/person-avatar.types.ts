export type PersonAvatarProps = Readonly<{
  name: string | null;
  src?: string | null;
  orbit?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  className?: string;
}>;
