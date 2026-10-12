import type { Metadata } from 'next';
import NewTicketForm from '@/components/NewTicketForm';

export const metadata: Metadata = { title: 'New ticket' };

export default function Page() {
  return <NewTicketForm />;
}
