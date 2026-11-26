export type InviteSignInFormProps = Readonly<{
  token: string;
}>;

export type SignInStage =
  { stage: "form" } | { stage: "sent"; email: string } | { stage: "private"; email: string };
