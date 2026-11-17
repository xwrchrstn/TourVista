const reservationEvents = {
  pending: {
    subject: 'Reservation request received',
    tourist: 'We received your request. It is pending until the campsite owner confirms it.',
    owner: 'A guest sent a reservation request. Open your TourVista workspace to review it.',
  },
  confirmed: {
    subject: 'Reservation confirmed',
    tourist: 'The campsite owner confirmed your stay. Open My trips to see your booking and plan your route.',
  },
  rejected: {
    subject: 'Reservation request declined',
    tourist: 'The campsite owner declined your request. Open My trips to see your reservation status.',
  },
  cancelled: {
    subject: 'Reservation cancelled',
    tourist: 'This reservation has been cancelled. Open My trips for the current status.',
    owner: 'This reservation has been cancelled. Open your workspace for the current status.',
  },
  checked_in: {
    subject: 'Campsite check-in recorded',
    tourist: 'TourVista recorded your campsite check-in.',
    owner: 'TourVista recorded the guest’s campsite check-in.',
  },
  completed: {
    subject: 'Campsite stay completed',
    tourist: 'Your stay is complete. You can now leave a review from My trips.',
  },
};

const listingEvents = {
  pending: ['Campsite submitted for review', 'A campsite owner submitted a listing. Sign in to TourVista to review it.'],
  approved: ['Campsite listing approved', 'TourVista approved your listing. Open My campsites to view its publication status.'],
  rejected: ['Campsite listing needs changes', 'TourVista declined your submission. Open My campsites to read the review and make changes.'],
  suspended: ['Campsite listing suspended', 'TourVista suspended your listing. Open My campsites to see the reason and next steps.'],
};

export function createNotifications(mailer, mailQueue) {
  function message(user, role, type, recordId, subject, body, page) {
    if (!user?.active || user.role !== role || !user.emailVerified ||
        typeof user.email !== 'string' || !/^[^\s@<>,;:"()[\]\\]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(user.email)) return [];
    return [{ userId: user.id, recordId, type, to: user.email, subject, text: `${body}\n\nOpen TourVista: ${mailer.origin}/#/${page}` }];
  }

  return {
    reservation(state, booking, unit, { campsiteSuspended = false } = {}) {
      if (mailer.mode !== 'smtp') return [];
      const event = campsiteSuspended ? {
        subject: 'Reservation cancelled',
        tourist: 'TourVista suspended this campsite and cancelled your reservation. Open My trips for the current status.',
        owner: 'TourVista suspended this campsite and cancelled this reservation. Open your workspace for the current status.',
      } : reservationEvents[booking.status];
      if (!event) return [];
      const camp = state.campsites.find((item) => item.id === unit.campId);
      const tourist = state.users.find((user) => user.id === booking.userId);
      const owner = state.users.find((user) => user.id === camp?.ownerId);
      const subject = `TourVista #${booking.id} · ${event.subject}`;
      const details = `Reservation #${booking.id}\nCampsite: ${booking.campSnapshot?.name || camp?.name || 'See your reservation'}\nStay: ${booking.start} to ${booking.end}\nGuests: ${booking.partySize}`;
      const messages = message(tourist, 'tourist', 'Reservation', booking.id, subject, `${event.tourist}\n\n${details}`, `confirmation/${booking.id}`);
      if (event.owner) messages.push(...message(owner, 'owner', 'Reservation', booking.id, subject, `${event.owner}\n\n${details}`, 'bookings'));
      return messages;
    },
    listing(state, camp, status) {
      if (mailer.mode !== 'smtp') return [];
      const [title, body] = listingEvents[status];
      const role = status === 'pending' ? 'admin' : 'owner';
      const recipients = status === 'pending' ? state.users.filter((user) => user.role === 'admin')
        : state.users.filter((user) => user.id === camp.ownerId);
      return recipients.flatMap((user) => message(user, role, 'Listing', camp.id, `TourVista · ${title}`, `${body}\n\nCampsite #${camp.id}: ${camp.name}`, 'listings'));
    },
    send(messages) { for (const entry of messages) mailQueue.push(entry); },
  };
}
