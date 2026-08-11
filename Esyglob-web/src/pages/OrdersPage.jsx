import { ArrowRight, PackageCheck, Truck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchServiceRequests } from "../api/services";
import { fetchOrders } from "../api/trade";
import { useAuth } from "../auth/auth-context";
import AppShell from "../components/AppShell";
import { PageHead } from "../components/PageHead";
import ProviderBrand from "../components/ProviderBrand";
import { Money, StatusBadge } from "../components/TradeUI";
import UnifiedSearchInput from "../components/UnifiedSearchInput";
import useAsyncData from "../hooks/useAsyncData";
import { displayName, resolveId } from "../utils/trade";
import { TradeSkeleton } from "./RfqsPage";

export default function OrdersPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = user?.primaryRole === "seller" ? "seller" : "buyer";
  const status = params.get("status") || "";
  const [search, setSearch] = useState("");
  const query = useAsyncData(
    useCallback(
      () =>
        fetchOrders({
          type: role,
          status: status || undefined,
          q: search || undefined,
        }),
      [role, search, status]
    )
  );
  const serviceQuery = useAsyncData(
    useCallback(() => fetchServiceRequests({ role, limit: 100 }), [role])
  );
  const serviceBookings = useMemo(() => {
    const term = search.toLowerCase();
    return (serviceQuery.data || []).filter(
      (item) =>
        item.paymentStatus === "paid" &&
        (!status || item.status === status) &&
        [
          item.requestNumber,
          item.serviceTitle,
          item.provider?.name,
          item.provider?.serviceName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
    );
  }, [search, serviceQuery.data, status]);

  return (
    <AppShell>
      <div className="listing-page container trade-page">
        <PageHead
          eyebrow="Trade execution"
          title="Orders"
          description="Marketplace orders and paid service bookings, with payment and fulfillment status."
        />
        <div className="trade-toolbar">
          <UnifiedSearchInput
            compact
            suggestions={false}
            value={search}
            onChange={setSearch}
            onSubmit={setSearch}
            placeholder="Search orders and service bookings"
          />
          <label>
            Status
            <select
              value={status}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                event.target.value
                  ? next.set("status", event.target.value)
                  : next.delete("status");
                setParams(next);
              }}
            >
              <option value="">All</option>
              {[
                "pending",
                "confirmed",
                "processing",
                "booking_pending",
                "shipped",
                "in_transit",
                "delivered",
                "completed",
                "cancelled",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        {serviceBookings.length > 0 && (
          <section className="linked-service-orders">
            <div className="compact-heading">
              <div>
                <span className="eyebrow">Logistics services</span>
                <h2>Service bookings</h2>
              </div>
              <Link to="/services/requests">
                My Services <ArrowRight />
              </Link>
            </div>
            <div className="order-list">
              {serviceBookings.map((item) => (
                <article key={resolveId(item)}>
                  <i>
                    {item.provider?.key ? (
                      <ProviderBrand providerKey={item.provider.key} compact />
                    ) : (
                      <Truck />
                    )}
                  </i>
                  <div>
                    <span className="eyebrow">{item.requestNumber}</span>
                    <h2>{item.serviceTitle}</h2>
                    <p>
                      {item.provider?.name || "Managed service"}
                      {item.provider?.serviceName
                        ? ` · ${item.provider.serviceName}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <b>
                      <Money
                        value={item.pricing?.totalPayable}
                        currency={item.pricing?.currency}
                      />
                    </b>
                    <StatusBadge status={item.status} />
                  </div>
                  <Link to={`/services/requests/${resolveId(item)}`}>
                    Booking details <ArrowRight />
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

        {query.loading ? (
          <TradeSkeleton />
        ) : query.error ? (
          <div className="inline-error">{query.error.message}</div>
        ) : query.data?.length ? (
          <div className="order-list">
            {query.data.map((item) => (
              <article key={resolveId(item)}>
                <i>
                  {item.status === "shipped" ? <Truck /> : <PackageCheck />}
                </i>
                <div>
                  <span className="eyebrow">
                    {item.orderNumber || "Trade order"}
                  </span>
                  <h2>
                    {item.productId?.name ||
                      item.products?.[0]?.name ||
                      item.rfqId?.title ||
                      "Marketplace order"}
                  </h2>
                  <p>
                    {role === "seller"
                      ? `Buyer: ${displayName(item.buyerId)}`
                      : `Seller: ${displayName(item.sellerId)}`}
                  </p>
                </div>
                <div>
                  <b>
                    <Money value={item.totalAmount} currency={item.currency} />
                  </b>
                  <StatusBadge status={item.status || "pending"} />
                </div>
                <Link to={`/orders/${resolveId(item)}`}>
                  View order <ArrowRight />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          !serviceBookings.length && (
            <div className="empty-results">
              <PackageCheck />
              <h2>No orders found</h2>
              <p>
                Paid service bookings and accepted quotation orders appear here
                automatically.
              </p>
            </div>
          )
        )}
      </div>
    </AppShell>
  );
}
