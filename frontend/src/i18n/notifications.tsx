"use client";
import { toast } from "sonner";
import { useI18n } from "./provider";
import { describeError } from "./errors";
import type { Message, MessageKey, MessageValues } from "./config";
function MessageText({ message }: { message: Message }) {
  const { t } = useI18n();
  return <>{t(message.key, message.values)}</>;
}
// Store message descriptors instead of rendered strings so visible toasts also
// change language when the provider changes, including in-flight operations.
export const notify = {
  success(key: MessageKey, values?: MessageValues, description?: Message) {
    toast.success(<MessageText message={{ key, values }} />, {
      description: description ? (
        <MessageText message={description} />
      ) : undefined,
    });
  },
  error(error: unknown, title?: MessageKey) {
    const message = describeError(error);
    toast.error(<MessageText message={title ? { key: title } : message} />, {
      description: title ? <MessageText message={message} /> : undefined,
    });
  },
};
