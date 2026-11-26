export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailDrop = {
  messages: CapturedEmail[];
};
