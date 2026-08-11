import { ArrowRight, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchServiceRequests } from "../api/services";
import { useAuth } from "../auth/auth-context";
import AppShell from "../components/AppShell";
import { PageHead } from "../components/PageHead";
import { Money, StatusBadge } from "../components/TradeUI";
import UnifiedSearchInput from "../components/UnifiedSearchInput";
import ProviderBrand from "../components/ProviderBrand";
import useAsyncData from "../hooks/useAsyncData";
import { resolveId } from "../utils/trade";
import { TradeSkeleton } from "./RfqsPage";

const STATUSES = [
  "all",
  "submitted",
  "under_review",
  "documents_required",
  "booking_pending",
  "confirmed",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "completed",
  "failed",
  "cancelled",
];

export default function ServiceRequestsPage() {
  const { user } = useAuth();
  const role = user?.primaryRole === "seller" ? "seller" : "buyer";
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const query = useAsyncData(
    useCallback(
      () =>
        fetchServiceRequests({
          role,
          status: status === "all" ? undefined : status,
        }),
      [role, status]
    )
  );
  const items = useMemo(() => {
    const term = search.toLowerCase();
    return (query.data || []).filter((item) =>
      [
        item.serviceTitle,
        item.requestNumber,
        item.provider?.name,
        item.provider?.trackingNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [query.data, search]);

  return (
    <AppShell>
      <div className="container module-page">
        <PageHead
          eyebrow="Trade operations"
          title="My Services"
          description="Track provider bookings, payments, invoices, pickup milestones and live shipment progress."
        />
        <div className="module-toolbar">
          <UnifiedSearchInput
            compact
            suggestions={false}
            value={search}
            onChange={setSearch}
            onSubmit={setSearch}
            placeholder="Search service, provider or tracking number"
          />
          <label>
            <SlidersHorizontal />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <Link className="button button--primary" to="/services">
            Book service
          </Link>
        </div>
        {query.loading ? (
          <TradeSkeleton />
        ) : query.error ? (
          <p className="inline-error">{query.error.message}</p>
        ) : items.length ? (
          <div className="service-request-list">
            {items.map((item) => {
              const provider = item.provider || {};
              return (
                <Link
                  key={resolveId(item)}
                  to={`/services/requests/${resolveId(item)}`}
                >
                  <i>
                    {provider.name ? (
                      <ProviderBrand providerKey={provider.key} compact />
                    ) : (
                      <CalendarDays />
                    )}
                  </i>
                  <div>
                    <span>{item.serviceTitle}</span>
                    <h2>{item.requestNumber}</h2>
                    <p>
                      {provider.name
                        ? `${provider.name}${
                            provider.serviceName
                              ? ` · ${provider.serviceName}`
                              : ""
                          }`
                        : item.details || "Managed trade service"}
                    </p>
                    <small>
                      {new Date(item.createdAt).toLocaleDateString()} ·{" "}
                      {item.role}
                      {provider.trackingNumber
                        ? ` · Tracking ${provider.trackingNumber}`
                        : ""}
                    </small>
                  </div>
                  <aside>
                    <StatusBadge status={item.status} />
                    <b>
                      <Money
                        value={item.pricing?.totalPayable}
                        currency={item.pricing?.currency}
                      />
                    </b>
                    <small>Payment {item.paymentStatus}</small>
                  </aside>
                  <ArrowRight />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-results">
            <CalendarDays />
            <h2>No service bookings</h2>
            <p>
              Your booked logistics and managed trade services will appear here.
            </p>
            <Link className="button button--primary" to="/services">
              Browse services
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
