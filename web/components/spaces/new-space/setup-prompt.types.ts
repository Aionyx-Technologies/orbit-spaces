export type SetupPromptProps = Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  working: boolean;
  notice: string | null;
  quiet: boolean;
}>;
