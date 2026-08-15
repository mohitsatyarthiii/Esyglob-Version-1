import { Archive, ArrowRight, Filter, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchRfqs } from "../api/trade";
import { useAuth } from "../auth/auth-context";
import AppShell from "../components/AppShell";
import { Money, StatusBadge } from "../components/TradeUI";
import useAsyncData from "../hooks/useAsyncData";
import { PageHead } from "../components/PageHead";
import UnifiedSearchInput from "../components/UnifiedSearchInput";
import { fetchCategories } from "../api/marketplace";

const filters = [
  "all",
  "active",
  "draft",
  "quoted",
  "negotiating",
  "converted",
  "closed",
  "archived",
];

export default function RfqsPage() {
  const { user, status: authStatus } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = authStatus !== "authenticated" ? "public" : user?.primaryRole === "seller" ? "seller" : "buyer";
  const status = params.get("status") || "all";
  const q = params.get("q") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [categories, setCategories] = useState([]);
  const category = params.get("category") || "";
  const subcategory = params.get("subcategory") || "";
  const country = params.get("country") || "";
  const dateFrom = params.get("dateFrom") || "";
  useEffect(() => { fetchCategories().then(setCategories).catch(() => setCategories([])); }, []);
  const selectedCategory = categories.find((item) => item.name === category);
  const loader = useCallback(
    () =>
      fetchRfqs({
        scope: role,
        status: status === "all" ? undefined : status,
        q,
        category: category || undefined,
        subcategory: subcategory || undefined,
        country: country || undefined,
        dateFrom: dateFrom || undefined,
        page,
        limit: 20,
        sort: "createdAt",
        order: "desc",
      }),
    [category, country, dateFrom, page, q, role, status, subcategory]
  );
  const query = useAsyncData(loader);
  const rows = query.data?.rfqs || [];
  const pagination = query.data?.pagination || {};
  const visibleFilters = role === "public" ? ["all", "submitted", "active", "quoted", "negotiating"] : filters;
  const heading = role === "buyer" ? "My RFQs" : "Public RFQ Marketplace";
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <AppShell>
      <div className="listing-page container trade-page">
        <PageHead
          eyebrow={
            role === "buyer" ? "Buyer sourcing" : "Manufacturer opportunities"
          }
          title={heading}
          description={
            role === "buyer"
              ? "Create, track and manage sourcing requirements and manufacturer responses."
              : "Discover active public requirements and submit a connected quotation."
          }
        />
        <div className="trade-page-actions">
          {role === "buyer" && (
            <Link className="button button--primary" to="/rfqs/new">
              <Plus /> Create RFQ
            </Link>
          )}
          {role !== "public" && <Link
            className="button button--secondary"
            to={`/quotations?role=${role}`}
          >
            Quotations <ArrowRight />
          </Link>}
        </div>
        <div className="trade-toolbar">
          <UnifiedSearchInput
            compact
            value={search}
            onChange={setSearch}
            onSubmit={(value) => set("q", value)}
            placeholder="Search RFQs by product, category or destination"
            showSubmit
          />
          <label>
            <Filter /> Status
            <select
              value={status}
              onChange={(e) => set("status", e.target.value)}
            >
              {visibleFilters.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>Category<select value={category} onChange={(event) => { const next = new URLSearchParams(params); event.target.value ? next.set("category", event.target.value) : next.delete("category"); next.delete("subcategory"); next.delete("page"); setParams(next); }}><option value="">All categories</option>{categories.map((item) => <option value={item.name} key={item._id || item.slug}>{item.name}</option>)}</select></label>
          <label>Subcategory<select value={subcategory} disabled={!category} onChange={(event) => set("subcategory", event.target.value)}><option value="">All subcategories</option>{(selectedCategory?.subcategories || []).map((item) => <option value={item.name} key={item._id || item.slug}>{item.name}</option>)}</select></label>
          <label>Location<input value={country} onChange={(event) => set("country", event.target.value)} placeholder="Country" /></label>
          <label>Posted since<input type="date" value={dateFrom} onChange={(event) => set("dateFrom", event.target.value)} /></label>
        </div>
        <div className="filter-chips">
          {visibleFilters.slice(0, 7).map((item) => (
            <button
              className={status === item ? "active" : ""}
              key={item}
              onClick={() => set("status", item)}
            >
              {item}
            </button>
          ))}
        </div>
        {query.loading ? (
          <TradeSkeleton count={5} />
        ) : query.error ? (
          <div className="inline-error">{query.error.message}</div>
        ) : rows.length ? (
          <div className="rfq-list">
            {rows.map((item) => (
              <RfqCard
                key={item._id || item.id}
                item={item}
                sellerView={role === "seller"}
              />
            ))}
          </div>
        ) : (
          <div className="empty-results">
            <Archive />
            <h2>No RFQs found</h2>
            <p>
              {role !== "buyer"
                ? "New matching buyer requirements will appear here."
                : "Create an RFQ to start receiving manufacturer quotations."}
            </p>
          </div>
        )}
        {!query.loading && !query.error && Number(pagination.pages || pagination.totalPages || 0) > 1 && (
          <nav className="trade-page-actions" aria-label="RFQ pages">
            <button className="button button--secondary" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</button>
            <span>Page {page} of {pagination.pages || pagination.totalPages}</span>
            <button className="button button--secondary" disabled={!pagination.hasMore && page >= Number(pagination.pages || pagination.totalPages)} onClick={() => set("page", String(page + 1))}>Next</button>
          </nav>
        )}
      </div>
    </AppShell>
  );
}

export function RfqCard({ item, sellerView }) {
  const id = item._id || item.id;
  const deadline = item.deadline || item.expiresAt;
  const path = `/rfqs/${id}${sellerView ? "?role=seller" : ""}`;
  return (
    <article className="rfq-card">
      <div className="rfq-card__top">
        <div>
          <span className="eyebrow">
            {item.rfqNumber || item.category || "Request for quotation"}
          </span>
          <h2>
            <Link to={path}>{item.title || item.productName || "RFQ"}</Link>
          </h2>
        </div>
        <StatusBadge status={item.status || "active"} />
      </div>
      <p>
        {item.description ||
          item.specifications ||
          "Buyer requirements available in RFQ details."}
      </p>
      <div className="rfq-card__facts">
        <span><small>Category</small><b>{[item.category, item.subcategory].filter(Boolean).join(" / ") || "—"}</b></span>
        <span>
          <small>Quantity</small>
          <b>
            {item.quantity || "—"} {item.unit || "units"}
          </b>
        </span>
        <span>
          <small>Target</small>
          <b>
            <Money value={item.targetPrice} currency={item.currency} />
          </b>
        </span>
        <span>
          <small>Destination</small>
          <b>{item.deliveryCountry || item.destinationCountry || "—"}</b>
        </span>
        <span>
          <small>Posted</small>
          <b>{new Date(item.createdAt).toLocaleDateString()}</b>
        </span>
        {deadline && <span><small>Required by</small><b>{new Date(deadline).toLocaleDateString()}</b></span>}
      </div>
      <div className="rfq-card__footer">
        <span>
          {item.quotationCount || 0} quotation
          {Number(item.quotationCount) === 1 ? "" : "s"}
        </span>
        <Link to={path}>
          {sellerView ? "Review and quote" : "View manufacturer responses"} <ArrowRight />
        </Link>
      </div>
    </article>
  );
}

export function TradeSkeleton({ count = 4 }) {
  return (
    <div className="trade-skeletons">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <i />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
