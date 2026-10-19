import "server-only";
import type { Balance, BookingDto, ContactDto, OrderDto, PayoutDto, ProductDto } from "@tashkeel/contracts";
import { api } from "@/lib/api";

type Page<T> = { data: T[]; nextCursor: string | null };

/** Typed reads for the expert dashboard. All amounts stay as minor-unit strings. */
export const dashboardData = (token: string, workspaceId: string) => {
  const w = `/v1/workspaces/${workspaceId}`;
  return {
    balances: () => api<{ data: Balance[] }>(`${w}/balance`, { token }).then((r) => r.data),
    orders: (limit = 25) => api<Page<OrderDto>>(`${w}/orders?limit=${limit}`, { token }),
    contacts: () => api<{ data: ContactDto[]; pagination: { totalItems: number } }>(`${w}/contacts?pageSize=50`, { token }),
    bookings: () => api<{ data: BookingDto[] }>(`${w}/bookings`, { token }).then((r) => r.data),
    products: () => api<{ data: ProductDto[] }>(`${w}/products`, { token }).then((r) => r.data),
    payouts: () => api<{ data: PayoutDto[] }>(`${w}/payouts`, { token }).then((r) => r.data),
    profiles: () => api<{ data: Array<{ id: string; method: string; label: string; maskedHint: string; isDefault: boolean }> }>(`${w}/payout-profiles`, { token }).then((r) => r.data),
    billing: () =>
      api<{ planCode: string; subscription: { status: string; currentPeriodEnd: string | null } | null; plans: Array<{ code: string; name: string; nameAr: string; monthlyMinor: string; currency: string; feeBps: number }> }>(`${w}/billing`, { token }),
  };
};
