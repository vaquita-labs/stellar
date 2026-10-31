import { SupportChatPage } from '@/core-ui/components';

export default async function Page({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <SupportChatPage ticketId={ticketId} />;
}
