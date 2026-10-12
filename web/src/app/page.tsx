import TicketTracker from '@/components/TicketTracker';

export default async function Page({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  return <TicketTracker justCreated={created === '1'} />;
}
