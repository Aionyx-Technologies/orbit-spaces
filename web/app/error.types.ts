export type ErrorPageProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;
