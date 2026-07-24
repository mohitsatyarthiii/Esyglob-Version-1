import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileUp,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createServiceRequest,
  fetchServiceQuote,
  getService,
  initiateServicePayment,
  loadRazorpay,
  verifyServicePayment,
} from "../api/services";
import { useAuth } from "../auth/auth-context";
import AppShell from "../components/AppShell";
import { AttachmentUploader, Money } from "../components/TradeUI";

const TIERS = [
  {
    key: "basic",
    label: "Basic",
    delivery: "5–7 days",
    support: "Standard support",
    benefits: ["Core delivery", "Status tracking"],
  },
  {
    key: "standard",
    label: "Standard",
    delivery: "3–5 days",
    support: "Priority support",
    benefits: ["Priority processing", "Enhanced reporting"],
  },
  {
    key: "premium",
    label: "Premium",
    delivery: "2–3 days",
    support: "Dedicated support",
    benefits: ["Expedited processing", "Dedicated specialist"],
  },
  {
    key: "enterprise",
    label: "Enterprise",
    delivery: "Custom SLA",
    support: "Account manager",
    benefits: ["Custom scope", "Advanced compliance"],
  },
];

function openServicePayment(session, requestId, serviceTitle) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency || "INR",
      order_id: session.razorpayOrderId,
      name: "EsyGlob",
      description: `${serviceTitle} booking`,
      handler: async (result) => {
        try {
          await verifyServicePayment(requestId, {
            razorpayPaymentId: result.razorpay_payment_id,
            razorpayOrderId: result.razorpay_order_id,
            razorpaySignature: result.razorpay_signature,
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              "Payment was cancelled. Your booking is saved and ready to retry.",
            ),
          ),
      },
      theme: { color: "#f26a21" },
    });
    checkout.on("payment.failed", (result) =>
      reject(
        new Error(result.error?.description || "Payment failed. Please retry."),
      ),
    );
    checkout.open();
  });
}

export default function ServiceBookingPage() {
  const { serviceKey } = useParams();
  const service = getService(serviceKey);
  const { user } = useAuth();
  const navigate = useNavigate();
  const roles = user?.roles || [user?.primaryRole || "buyer"];
  const [role, setRole] = useState(
    service?.role === "seller"
      ? "seller"
      : service?.role === "buyer"
        ? "buyer"
        : roles.includes("seller") && user?.primaryRole === "seller"
          ? "seller"
          : "buyer",
  );
  const [values, setValues] = useState({
    tier: "standard",
    priority: "normal",
    contactName: user?.name || "",
    contactEmail: user?.email || "",
    contactPhone: user?.phone || "",
  });
  const [documents, setDocuments] = useState([]);
  const [quote, setQuote] = useState(null);
  const [terms, setTerms] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const sections = useMemo(
    () =>
      service
        ? [
            ...new Set(
              service.fields.map((item) => item.step || "Booking details"),
            ),
          ]
        : [],
    [service],
  );

  if (!service)
    return (
      <AppShell>
        <div className="container module-page">
          <p className="inline-error">Service not found.</p>
        </div>
      </AppShell>
    );
  if (service.role === "seller" && !roles.includes("seller"))
    return (
      <AppShell>
        <div className="container module-page">
          <div className="empty-results">
            <ShieldCheck />
            <h2>Seller account required</h2>
            <p>
              Complete seller onboarding before requesting business
              verification.
            </p>
            <Link className="button button--primary" to="/profile">
              Review profile
            </Link>
          </div>
        </div>
      </AppShell>
    );

  function change(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    if (!requestId) setQuote(null);
  }

  async function calculate() {
    setBusy("quote");
    setError("");
    try {
      setQuote(await fetchServiceQuote(service.key, values));
    } catch (next) {
      setError(next.message);
    } finally {
      setBusy("");
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!terms)
      return setError("Accept the service and payment terms to continue.");
    setBusy("submit");
    setError("");
    try {
      let id = requestId;
      if (!id) {
        const request = await createServiceRequest(
          service,
          role,
          values,
          documents,
          true,
        );
        id = request._id || request.id;
        if (!id)
          throw new Error("Booking was created without a valid reference.");
        setRequestId(id);
      }
      const loaded = await loadRazorpay();
      if (!loaded)
        throw new Error(
          "Secure checkout could not be loaded. Check your connection and retry.",
        );
      const session = await initiateServicePayment(id);
      await openServicePayment(session, id, service.title);
      navigate(`/services/requests/${id}`, {
        replace: true,
        state: { paymentComplete: true },
      });
    } catch (next) {
      setError(next.message || "Payment could not be completed. Please retry.");
    } finally {
      setBusy("");
    }
  }

  return (
    <AppShell>
      <div className="container service-booking-page">
        <Link className="back-link" to={`/services/${service.key}`}>
          <ArrowLeft /> {service.title}
        </Link>
        <header>
          <span className="eyebrow">Secure service booking</span>
          <h1>Book {service.title}</h1>
          <p>
            Choose a service tier, review the final price and pay securely in
            one flow.
          </p>
        </header>
        {roles.includes("seller") && service.role === "both" && (
          <div className="role-switch">
            <button
              className={role === "buyer" ? "active" : ""}
              onClick={() => setRole("buyer")}
            >
              Book as buyer
            </button>
            <button
              className={role === "seller" ? "active" : ""}
              onClick={() => setRole("seller")}
            >
              Book as seller
            </button>
          </div>
        )}
        <form onSubmit={submit} className="service-booking-layout">
          <div>
            <section className="module-panel service-form-section">
              <h2>Choose your tier</h2>
              <div className="checkout-logistics">
                {TIERS.map((tier) => (
                  <button
                    type="button"
                    disabled={Boolean(requestId)}
                    className={values.tier === tier.key ? "active" : ""}
                    key={tier.key}
                    onClick={() => change("tier", tier.key)}
                  >
                    <span>
                      <b>{tier.label}</b>
                      <small>
                        {tier.delivery} · {tier.support}
                      </small>
                      <small>{tier.benefits.join(" · ")}</small>
                    </span>
                    {values.tier === tier.key && <CheckCircle2 />}
                  </button>
                ))}
              </div>
            </section>
            {sections.map((section) => (
              <section
                className="module-panel service-form-section"
                key={section}
              >
                <h2>{section}</h2>
                <div className="form-grid">
                  {service.fields
                    .filter(
                      (item) => (item.step || "Booking details") === section,
                    )
                    .map((item) => (
                      <ServiceField
                        key={item.key}
                        field={item}
                        value={values[item.key] || ""}
                        disabled={Boolean(requestId)}
                        onChange={(value) => change(item.key, value)}
                      />
                    ))}
                </div>
              </section>
            ))}
            <section className="module-panel service-form-section">
              <h2>
                <FileUp /> Supporting documents
              </h2>
              <p>
                Upload invoices, specifications, registrations or other relevant
                evidence.
              </p>
              <AttachmentUploader
                folder="service-requests"
                value={documents}
                onChange={setDocuments}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
            </section>
          </div>
          <aside className="module-panel service-quote-card">
            <ShieldCheck />
            <h2>Booking summary</h2>
            <p>
              {service.title} ·{" "}
              {TIERS.find((item) => item.key === values.tier)?.label}
            </p>
            <label>
              Priority
              <select
                disabled={Boolean(requestId)}
                value={values.priority}
                onChange={(event) => change("priority", event.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            {quote ? (
              <div className="quote-breakdown">
                <span>
                  Base cost{" "}
                  <b>
                    <Money value={quote.baseCost} currency={quote.currency} />
                  </b>
                </span>
                <span>
                  Additional charges{" "}
                  <b>
                    <Money
                      value={quote.additionalCharges}
                      currency={quote.currency}
                    />
                  </b>
                </span>
                <span>
                  Platform fee{" "}
                  <b>
                    <Money
                      value={quote.platformFee}
                      currency={quote.currency}
                    />
                  </b>
                </span>
                <span>
                  GST ({quote.gstRate}%){" "}
                  <b>
                    <Money value={quote.gstAmount} currency={quote.currency} />
                  </b>
                </span>
                <strong>
                  Total{" "}
                  <b>
                    <Money
                      value={quote.totalPayable}
                      currency={quote.currency}
                    />
                  </b>
                </strong>
              </div>
            ) : (
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={calculate}
                disabled={Boolean(busy)}
              >
                <Calculator />{" "}
                {busy === "quote" ? "Calculating…" : "Calculate quote"}
              </button>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={terms}
                onChange={(event) => setTerms(event.target.checked)}
              />{" "}
              I accept the service scope, cancellation and payment terms.
            </label>
            {error && <p className="action-error">{error}</p>}
            {requestId && (
              <p>
                <CheckCircle2 /> Booking saved. Payment is required before
                review begins.
              </p>
            )}
            <button
              className="button button--primary button--full"
              disabled={Boolean(busy) || !terms}
            >
              <CreditCard />{" "}
              {busy === "submit"
                ? "Opening secure payment…"
                : requestId
                  ? "Retry payment"
                  : "Book and pay"}
            </button>
            <small>
              Razorpay verifies payment before the service team receives the
              booking.
            </small>
          </aside>
        </form>
      </div>
    </AppShell>
  );
}

function ServiceField({ field, value, disabled, onChange }) {
  const props = {
    value,
    disabled,
    required: field.required,
    onChange: (event) => onChange(event.target.value),
  };
  return (
    <label className={field.type === "textarea" ? "field-wide" : ""}>
      {field.label}
      {field.type === "select" ? (
        <select {...props}>
          <option value="">Select</option>
          {field.options.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea {...props} rows="4" />
      ) : (
        <input
          {...props}
          type={field.type || "text"}
          min={field.type === "number" ? 0 : undefined}
        />
      )}
    </label>
  );
}
