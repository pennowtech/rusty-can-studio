import { MessageEditor } from "@/profile-editor/MessageEditor";

export function MessageEditorDrawer({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  return <MessageEditor messageId={messageId} onClose={onClose} layout="drawer" />;
}
