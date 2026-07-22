import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/auth-context'
import ProtectedRoute from './auth/ProtectedRoute'
import SplashScreen from './pages/SplashScreen'
import AIErrorBoundary from './components/AIErrorBoundary'
import './App.css'

const WelcomePage = lazy(() => import('./pages/WelcomePage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const CategoryDetailsPage = lazy(() => import('./pages/CategoryDetailsPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductDetailsPage = lazy(() => import('./pages/ProductDetailsPage'))
const SellersPage = lazy(() => import('./pages/SellersPage'))
const SellerDetailsPage = lazy(() => import('./pages/SellerDetailsPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const ServiceDetailsPage = lazy(() => import('./pages/ServiceDetailsPage'))
const ServiceBookingPage = lazy(() => import('./pages/ServiceBookingPage'))
const ServiceRequestsPage = lazy(() => import('./pages/ServiceRequestsPage'))
const ServiceRequestDetailsPage = lazy(() => import('./pages/ServiceRequestDetailsPage'))
const SimilarSearchPage = lazy(() => import('./pages/SimilarSearchPage'))
const ImageSearchPage = lazy(() => import('./pages/ImageSearchPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const RfqsPage = lazy(() => import('./pages/RfqsPage'))
const RfqCreatePage = lazy(() => import('./pages/RfqCreatePage'))
const RfqDetailsPage = lazy(() => import('./pages/RfqDetailsPage'))
const QuotationsPage = lazy(() => import('./pages/QuotationsPage'))
const QuotationDetailsPage = lazy(() => import('./pages/QuotationDetailsPage'))
const QuotationComparePage = lazy(() => import('./pages/QuotationComparePage'))
const AgreementsPage = lazy(() => import('./pages/AgreementsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const OrderDetailsPage = lazy(() => import('./pages/OrderDetailsPage'))
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'))
const AddressesPage = lazy(() => import('./pages/AddressesPage'))
const LocationPage = lazy(() => import('./pages/LocationPage'))
const SavedItemsPage = lazy(() => import('./pages/SavedItemsPage'))
const WalletPage = lazy(() => import('./pages/WalletPage'))
const SellerProductsPage = lazy(() => import('./pages/SellerProductsPage'))
const SellerProductFormPage = lazy(() => import('./pages/SellerProductFormPage'))
const AIChatPage = lazy(() => import('./pages/AIChatPage'))
const MarketInsightsPage = lazy(() => import('./pages/MarketInsightsPage'))
const TradeCalculatorPage = lazy(() => import('./pages/TradeCalculatorPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MarketplaceDashboardPage = lazy(() => import('./pages/MarketplaceDashboardPage'))
const SellerVerificationPage = lazy(() => import('./pages/SellerVerificationPage'))
const FactoryManagementPage = lazy(() => import('./pages/FactoryManagementPage'))
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'))
const VerificationAdminPage = lazy(() => import('./pages/VerificationAdminPage'))
const SellerOrderQueuePage = lazy(() => import('./pages/SellerOrderQueuePage'))
const TradeWorkspacePage = lazy(() => import('./pages/TradeWorkspacePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function StartRoute() {
  const { status } = useAuth()
  return status === 'checking' ? <SplashScreen /> : <Navigate replace to="/home" />
}

export default function App() {
  return <Suspense fallback={<SplashScreen compact />}><Routes>
    <Route path="/" element={<StartRoute />} />
    <Route path="/welcome" element={<WelcomePage />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/signup" element={<AuthPage mode="signup" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route path="/reset-password" element={<AuthPage mode="reset" />} />
    <Route path="/home" element={<HomePage />} />
    <Route path="/categories" element={<CategoriesPage />} />
    <Route path="/categories/:categoryId" element={<CategoryDetailsPage />} />
    <Route path="/products" element={<ProductsPage />} />
    <Route path="/products/:productId" element={<ProductDetailsPage />} />
    <Route path="/sellers" element={<SellersPage />} />
    <Route path="/sellers/:sellerId" element={<SellerDetailsPage />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/explore" element={<ExplorePage />} />
    <Route path="/services" element={<ServicesPage />} />
    <Route path="/services/calculator" element={<TradeCalculatorPage />} />
    <Route path="/services/:serviceKey" element={<ServiceDetailsPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/products/:productId/similar-search" element={<SimilarSearchPage />} />
      <Route path="/explore/image-search" element={<ImageSearchPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/services/requests" element={<ServiceRequestsPage />} />
      <Route path="/services/requests/:requestId" element={<ServiceRequestDetailsPage />} />
      <Route path="/services/:serviceKey/book" element={<ServiceBookingPage />} />
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="/messages/:chatId" element={<ChatPage />} />
      <Route path="/rfqs" element={<RfqsPage />} />
      <Route path="/rfqs/new" element={<RfqCreatePage />} />
      <Route path="/rfqs/:rfqId" element={<RfqDetailsPage />} />
      <Route path="/quotations" element={<QuotationsPage />} />
      <Route path="/quotations/compare" element={<QuotationComparePage />} />
      <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      <Route path="/agreements" element={<AgreementsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/addresses" element={<AddressesPage />} />
      <Route path="/location" element={<LocationPage />} />
      <Route path="/saved" element={<SavedItemsPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/seller/products" element={<SellerProductsPage />} />
      <Route path="/seller/products/new" element={<SellerProductFormPage />} />
      <Route path="/seller/products/:productId/edit" element={<SellerProductFormPage />} />
      <Route path="/ai-chat" element={<AIErrorBoundary><AIChatPage /></AIErrorBoundary>} />
      <Route path="/market-insights" element={<MarketInsightsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/security" element={<SettingsPage />} />
      <Route path="/dashboard" element={<MarketplaceDashboardPage />} />
      <Route path="/seller/dashboard" element={<Navigate replace to="/dashboard?role=seller" />} />
      <Route path="/seller/verification" element={<SellerVerificationPage />} />
      <Route path="/seller/factory" element={<FactoryManagementPage />} />
      <Route path="/subscriptions" element={<SubscriptionPage />} />
      <Route path="/admin/verifications" element={<VerificationAdminPage />} />
      <Route path="/seller/order-queue" element={<SellerOrderQueuePage />} />
      <Route path="/trade-workspace/:entityType/:entityId" element={<TradeWorkspacePage />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>
}
