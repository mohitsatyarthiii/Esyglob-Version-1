import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Boxes,
  Calculator,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Search,
  ShieldCheck,
  Ship,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchServiceRequests,
  isServiceAvailable,
  servicesForRole,
} from "../api/services";
import { useAuth } from "../auth/auth-context";
import AppShell from "../components/AppShell";
import { PageHead } from "../components/PageHead";
import ProviderBrand from "../components/ProviderBrand";
import { ServiceTrustGrid } from "../components/ServiceTrust";
import TrustedPartners from "../components/TrustedPartners";
import { Money, StatusBadge } from "../components/TradeUI";
import UnifiedSearchInput from "../components/UnifiedSearchInput";
import useAsyncData from "../hooks/useAsyncData";
import { resolveId } from "../utils/trade";

const icons = {
  Logistics: Ship,
  "Trade Finance": Banknote,
  Inspection: ClipboardCheck,
  Protection: ShieldCheck,
  Verification: BadgeCheck,
  Advisory: FileCheck2,
};

export default function ServicesPage() {
  const { user, status } = useAuth();
  const authenticated = status === "authenticated";
  const role = user?.primaryRole === "seller" ? "seller" : "buyer";
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const activity = useAsyncData(
    useCallback(
      () =>
        authenticated ? fetchServiceRequests({ role }) : Promise.resolve([]),
      [authenticated, role]
    )
  );
  const catalog = servicesForRole(role);
  const categories = ["All", ...new Set(catalog.map((item) => item.category))];
  const visible = useMemo(
    () =>
      catalog.filter(
        (item) =>
          (category === "All" || item.category === category) &&
          `${item.title} ${item.description} ${item.category}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [catalog, category, search]
  );
  const availableServices = visible.filter(isServiceAvailable);
  const comingSoonServices = visible.filter(
    (item) => !isServiceAvailable(item)
  );
  const active =
    activity.data?.filter(
      (item) => !["completed", "cancelled"].includes(item.status)
    ).length || 0;

  return (
    <AppShell>
      <div className="container services-page">
        <PageHead
          eyebrow="End-to-end trade operations"
          title="Trade services"
          description="Book, pay for and track professional support across logistics, finance, quality, verification and compliance."
        />
        <Link className="service-calculator-card" to="/services/calculator">
          <i>
            <Calculator />
          </i>
          <div>
            <span>Primary trade tool</span>
            <h2>Esy Trade Calculator</h2>
            <p>
              Plan landed cost, GST, customs duty, freight, currency, profit,
              MOQ and packaging with the same tools as the mobile app.
            </p>
          </div>
          <strong>
            Open calculator <ArrowRight />
          </strong>
        </Link>
        {authenticated && (
          <section className="service-overview">
            <div>
              <span>Available services</span>
              <b>{catalog.filter(isServiceAvailable).length}</b>
            </div>
            <div>
              <span>Active requests</span>
              <b>{active}</b>
            </div>
            <div>
              <span>Total bookings</span>
              <b>{activity.data?.length || 0}</b>
            </div>
            <Link to="/services/requests">
              Booking history <ArrowRight />
            </Link>
          </section>
        )}
        <div className="service-toolbar">
          <UnifiedSearchInput
            compact
            value={search}
            onChange={setSearch}
            onSubmit={setSearch}
            placeholder="Search logistics, finance, inspection…"
          />
          <div>
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        {!!availableServices.length && (
          <>
            <div className="service-section-heading">
              <span>Available services</span>
              <h2>Ready when you are</h2>
              <p>
                Start a secure request, receive supported pricing, and track
                progress in one place.
              </p>
            </div>
            <div className="service-catalog">
              {availableServices.map((item) => {
                const Icon = icons[item.category] || Boxes;
                return (
                  <article
                    className={`service-accent service-accent--${item.key}`}
                    key={item.key}
                  >
                    <header className="service-card-heading">
                      <div className="service-card-icon">
                        <Icon />
                      </div>
                      <span>{item.category}</span>
                    </header>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                    <TrustedPartners
                      serviceKey={item.key}
                      title="Supported Providers"
                      compact
                    />
                    <div className="service-card-assurance">
                      <ShieldCheck />
                      <span>
                        <b>Verified service workflow</b>
                        <small>
                          Secure requirements and milestone tracking
                        </small>
                      </span>
                    </div>
                    <ul>
                      {item.steps.map((step) => (
                        <li key={step}>
                          <BadgeCheck /> {step}
                        </li>
                      ))}
                    </ul>
                    <footer>
                      <div>
                        <small>
                          {item.key === "shipping" ? "Pricing" : "Starting at"}
                        </small>
                        <b>
                          {item.startingPriceAmount !== null ? (
                            <>
                              <span>From </span>
                              <Money
                                value={item.startingPriceAmount}
                                currency={item.startingPriceCurrency}
                              />
                            </>
                          ) : (
                            item.startingPrice
                          )}
                        </b>
                      </div>
                      <Link to={`/services/${item.key}`}>
                        {item.key === "shipping"
                          ? "View rates"
                          : "View service"}{" "}
                        <ArrowRight />
                      </Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          </>
        )}
        {!!comingSoonServices.length && (
          <section className="coming-soon-services">
            <div className="service-section-heading">
              <span>Coming Soon</span>
              <h2>More ways to trade with confidence</h2>
              <p>
                These services are being prepared intentionally and are not yet
                open for booking.
              </p>
            </div>
            <div className="service-catalog service-catalog--soon">
              {comingSoonServices.map((item) => {
                const Icon = icons[item.category] || Boxes;
                return (
                  <article
                    className={`service-accent service-accent--${item.key}`}
                    key={item.key}
                  >
                    <span className="coming-soon-badge">Coming Soon</span>
                    <header className="service-card-heading">
                      <div className="service-card-icon">
                        <Icon />
                      </div>
                      <span>{item.category}</span>
                    </header>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                    <footer>
                      <div>
                        <small>Availability</small>
                        <b>In preparation</b>
                      </div>
                      <Link to={`/services/${item.key}`}>
                        Learn more <ArrowRight />
                      </Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {!visible.length && (
          <div className="empty-results">
            <Search />
            <h2>No matching services</h2>
            <p>Try another service name or category.</p>
          </div>
        )}
        <section className="services-trust-overview">
          <div>
            <span>One coordinated network</span>
            <h2>Professional support across every trade milestone</h2>
            <p>
              Secure workflows, verified operations and service visibility from
              request through completion.
            </p>
          </div>
          <ServiceTrustGrid />
        </section>
        {authenticated && activity.data?.length > 0 && (
          <section className="module-panel recent-services">
            <div className="compact-heading">
              <h2>
                <Clock3 /> Recent bookings
              </h2>
              <Link to="/services/requests">View all</Link>
            </div>
            {activity.data.slice(0, 4).map((item) => (
              <Link
                key={resolveId(item)}
                to={`/services/requests/${resolveId(item)}`}
              >
                {item.provider?.key && (
                  <ProviderBrand providerKey={item.provider.key} compact />
                )}
                <div>
                  <b>{item.serviceTitle}</b>
                  <small>
                    {item.requestNumber} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </small>
                </div>
                <StatusBadge status={item.status} />
                <ArrowRight />
              </Link>
            ))}
          </section>
        )}
        {!authenticated && (
          <section className="service-cta">
            <ShieldCheck />
            <div>
              <h2>Ready to manage a trade service?</h2>
              <p>
                Sign in to receive a live quote, book securely and track every
                milestone.
              </p>
            </div>
            <Link
              className="button button--primary"
              to="/login"
              state={{ from: "/services" }}
            >
              Login to continue
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
