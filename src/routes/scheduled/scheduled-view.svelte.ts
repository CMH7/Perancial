// The Scheduled pages' shared search, filters, sort and grouping: the plan list pane and the
// Upcoming / Overdue list both read them. Kept for the session, so they survive Back.
import { noPlanFilters, type PlanGroup, type PlanSort } from '#lib/domain/index.ts';

class ScheduledView {
	f = $state(noPlanFilters());
	sort = $state<PlanSort>('next');
	group = $state<PlanGroup>('none');

	/** Search and filters both lists share; the plan status (`show`) is kept. */
	get filtering() {
		return !!(this.f.q || this.f.kind || this.f.accountId || this.f.tag);
	}
	clear() {
		this.f = { ...noPlanFilters(), show: this.f.show };
	}
}

export const scheduledView = new ScheduledView();
