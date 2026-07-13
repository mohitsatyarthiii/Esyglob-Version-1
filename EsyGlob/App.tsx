import React, { useEffect } from 'react';
import { AppState, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider, Persister } from '@tanstack/react-query-persist-client';
import { AuthProvider } from './src/auth/AuthContext';
import AppTabs from './src/navigation/AppTabs';
import AIChatScreen from './src/screens/AIChatScreen';
import AuthScreen from './src/screens/AuthScreen';
import ChatDetailsScreen from './src/screens/ChatDetailsScreen';
import MarketInsightsScreen from './src/screens/MarketInsightsScreen';
import AddressesScreen from './src/screens/AddressesScreen';
import NotificationCenterScreen from './src/screens/NotificationCenterScreen';
import ProductDetailsScreen from './src/screens/ProductDetailsScreen';
import ProfileSettingsScreen from './src/screens/ProfileSettingsScreen';
import QuotationDetailsScreen from './src/screens/QuotationDetailsScreen';
import RFQScreen from './src/screens/RFQScreen';
import RFQDetailsScreen from './src/screens/RFQDetailsScreen';
import RFQCreateScreen from './src/screens/RFQCreateScreen';
import ReviewsDashboardScreen from './src/screens/ReviewsDashboardScreen';
import SecurityScreen from './src/screens/SecurityScreen';
import SearchScreen from './src/screens/SearchScreen';
import SavedItemsScreen from './src/screens/SavedItemsScreen';
import SellerDetailsScreen from './src/screens/SellerDetailsScreen';
import SellersScreen from './src/screens/SellersScreen';
import OrderCheckoutScreen from './src/screens/OrderCheckoutScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import PaymentDetailsScreen from './src/screens/PaymentDetailsScreen';
import InvoiceDetailsScreen from './src/screens/InvoiceDetailsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import SellerFactoryScreen from './src/screens/SellerFactoryScreen';
import SellerOnboardingScreen from './src/screens/SellerOnboardingScreen';
import SellerProductFormScreen from './src/screens/SellerProductFormScreen';
import SellerProductsScreen from './src/screens/SellerProductsScreen';
import ServiceBookingScreen from './src/screens/ServiceBookingScreen';
import ServiceDetailsScreen from './src/screens/ServiceDetailsScreen';
import BookedServiceDetailsScreen from './src/screens/BookedServiceDetailsScreen';
import ShippingLogisticsScreen from './src/screens/ShippingLogisticsScreen';
import WalletScreen from './src/screens/WalletScreen';
import { ServiceRequest } from './src/api/services';
import { fetchCategories, fetchProducts, fetchSellers } from './src/api/marketplace';
import { ProductListResponse } from './src/api/types';
import { logPerf } from './src/utils/performance';
import { readJson, writeJson } from './src/storage/appStorage';
import { RealtimeProvider } from './src/realtime';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import CurrencyProvider from './src/currency/CurrencyContext';
import LocationScreen from './src/screens/LocationScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  Auth: { initialMode?: 'login' | 'signup' | 'forgot' } | undefined;
  AIChat: undefined;
  HelpSupport: undefined;
  MarketInsights: undefined;
  Addresses: undefined;
  Notifications: undefined;
  SavedItems: undefined;
  ProfileSettings: undefined;
  Security: undefined;
  Wallet: undefined;
  ProductDetails: { productId: string };
  ProductListing: { category?: string; categoryName?: string; subcategory?: string; subcategoryName?: string; q?: string; seller?: string; sellerName?: string } | undefined;
  Search: { q?: string } | undefined;
  Sellers: undefined;
  SellerDetails: { sellerId: string; sellerName?: string };
  ChatDetails: { chatId: string; title?: string };
  RFQ: undefined;
  RFQCreate: { prefill?: Record<string, unknown> } | undefined;
  RFQDetails: { rfqId: string };
  ReviewsDashboard: undefined;
  QuotationDetails: { quotationId: string };
  OrderCheckout: { mode: 'sample' | 'trade'; productId?: string; chatId?: string; quotationId?: string };
  Orders: undefined;
  OrderDetails: { orderId: string };
  PaymentDetails: { paymentId: string; orderNumber?: string };
  InvoiceDetails: { invoiceId?: string; orderId?: string };
  SellerOnboarding: undefined;
  SellerFactory: undefined;
  SellerProducts: undefined;
  SellerProductForm: { productId?: string } | undefined;
  ServiceDetails: { serviceKey: string };
  ServiceBooking: { serviceKey: string };
  BookedServiceDetails: { mode?: 'list'; request?: ServiceRequest } | undefined;
  ShippingLogistics: undefined;
  Location: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ✅ FIXED: retry ab sirf number ya boolean leta hai
      retry: (failureCount: number, error: unknown) => {
        const status = typeof error === 'object' && error && 'status' in error ? Number((error as any).status) : 0;

        if (status >= 400 && status < 500) {
          return false;
        }

        return failureCount < 2;
      },
      // ✅ FIXED: retryDelay ab number leta hai ya function
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 4000),
      // ✅ FIXED: staleTime ab number leta hai
      staleTime: 3 * 60_000,
      // ✅ FIXED: gcTime ab number leta hai (pehle cacheTime tha)
      gcTime: 20 * 60_000,
      // ✅ FIXED: refetchOnMount ab boolean leta hai
      refetchOnMount: false,
      // ✅ FIXED: refetchOnReconnect ab boolean leta hai
      refetchOnReconnect: false,
      // ✅ FIXED: refetchOnWindowFocus ab boolean leta hai
      refetchOnWindowFocus: false,
    },
  },
});
const queryPersister = createMmkvQueryPersister();

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    logPerf('app:mounted');
  }, []);

  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    const appStateSubscription = AppState.addEventListener('change', status => {
      const active = status === 'active';
      focusManager.setFocused(active);

      if (active) {
        queryClient.refetchQueries({ stale: true, type: 'active' }).catch(() => undefined);
      }
    });

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, []);

  return (
    <AppErrorBoundary>
    <GestureHandlerRootView style={styles.gestureRoot}>
      <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        buster: 'esyglob-mobile-v2',
        maxAge: 60 * 60_000,
        dehydrateOptions: {
  shouldDehydrateQuery: (query: { state: { status: string }; queryKey: readonly unknown[] }) => {
    return query.state.status === 'success' && isPersistableQueryKey(query.queryKey);
  },
},
      }}
      onSuccess={warmMarketplaceQueries}>
      <AuthProvider>
        <CurrencyProvider>
        <RealtimeProvider>
        <SafeAreaProvider>
          <StatusBar
            translucent
            backgroundColor="transparent"
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          />
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="MainTabs" component={AppTabs} />
              <Stack.Screen name="Auth" component={AuthScreen} />
              <Stack.Screen name="AIChat" component={AIChatScreen} />
              <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
              <Stack.Screen name="MarketInsights" component={MarketInsightsScreen} />
              <Stack.Screen name="Addresses" component={AddressesScreen} />
              <Stack.Screen name="Notifications" component={NotificationCenterScreen} />
              <Stack.Screen name="SavedItems" component={SavedItemsScreen} />
              <Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
              <Stack.Screen name="Security" component={SecurityScreen} />
              <Stack.Screen name="Wallet" component={WalletScreen} />
              <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
              <Stack.Screen name="ProductListing" component={SearchScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="Sellers" component={SellersScreen} />
              <Stack.Screen name="SellerDetails" component={SellerDetailsScreen} />
              <Stack.Screen name="ChatDetails" component={ChatDetailsScreen} />
              <Stack.Screen name="RFQ" component={RFQScreen} />
              <Stack.Screen name="RFQCreate" component={RFQCreateScreen} />
              <Stack.Screen name="RFQDetails" component={RFQDetailsScreen} />
              <Stack.Screen name="ReviewsDashboard" component={ReviewsDashboardScreen} />
              <Stack.Screen name="QuotationDetails" component={QuotationDetailsScreen} />
              <Stack.Screen name="OrderCheckout" component={OrderCheckoutScreen} />
              <Stack.Screen name="Orders" component={OrdersScreen} />
              <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
              <Stack.Screen name="PaymentDetails" component={PaymentDetailsScreen} />
              <Stack.Screen name="InvoiceDetails" component={InvoiceDetailsScreen} />
              <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} />
              <Stack.Screen name="SellerFactory" component={SellerFactoryScreen} />
              <Stack.Screen name="SellerProducts" component={SellerProductsScreen} />
              <Stack.Screen name="SellerProductForm" component={SellerProductFormScreen} />
              <Stack.Screen name="ServiceDetails" component={ServiceDetailsScreen} />
              <Stack.Screen name="ServiceBooking" component={ServiceBookingScreen} />
              <Stack.Screen name="BookedServiceDetails" component={BookedServiceDetailsScreen} />
              <Stack.Screen name="ShippingLogistics" component={ShippingLogisticsScreen} />
              <Stack.Screen name="Location" component={LocationScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
        </RealtimeProvider>
        </CurrencyProvider>
      </AuthProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

export default App;

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});

function warmMarketplaceQueries() {
  queryClient.prefetchQuery({
    queryKey: ['home-categories'],
    queryFn: fetchCategories,
    staleTime: 10 * 60_000,
  }).catch(() => undefined);
  
  queryClient.prefetchQuery({
    queryKey: ['home-featured-products'],
    queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }),
    staleTime: 2 * 60_000,
  }).catch(() => undefined);
  
  queryClient.prefetchQuery({
    queryKey: ['home-latest-products'],
    queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }),
    staleTime: 2 * 60_000,
  }).catch(() => undefined);
  
  // ✅ FIXED: pageParam with default value
  queryClient.prefetchInfiniteQuery({
    queryKey: ['home-products-feed'],
    queryFn: ({ pageParam = 1 }) => fetchProducts({ 
      page: Number(pageParam), 
      limit: 18, 
      sort: 'latest' 
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: ProductListResponse) => {
      const pagination = lastPage.pagination;
      return pagination?.page && pagination.totalPages && pagination.page < pagination.totalPages
        ? pagination.page + 1
        : undefined;
    },
    staleTime: 3 * 60_000,
  }).catch(() => undefined);
  
  queryClient.prefetchQuery({
    queryKey: ['manufacturers-directory'],
    queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }),
    staleTime: 5 * 60_000,
  }).catch(() => undefined);
}

function createMmkvQueryPersister(): Persister {
  const storageKey = 'query.cache.marketplace.v2';
  const maxBytes = 1_500_000;

  return {
    persistClient: client => {
      const compacted = compactPersistedClient(client, maxBytes);
      writeJson(storageKey, compacted);
    },
    restoreClient: () => readJson(storageKey) ?? undefined,
    removeClient: () => writeJson(storageKey, null),
  };
}

function compactPersistedClient<T extends { clientState?: { queries?: unknown[] } }>(client: T, maxBytes: number) {
  let next = client;
  let serialized = JSON.stringify(next);

  if (serialized.length <= maxBytes) {
    return next;
  }

  const queries = [...(next.clientState?.queries ?? [])] as Array<{ state?: { dataUpdatedAt?: number } }>;
  queries.sort((a, b) => Number(b.state?.dataUpdatedAt ?? 0) - Number(a.state?.dataUpdatedAt ?? 0));

  while (queries.length > 8) {
    queries.pop();
    next = {
      ...client,
      clientState: {
        ...client.clientState,
        queries: [...queries],
      },
    };
    serialized = JSON.stringify(next);

    if (serialized.length <= maxBytes) {
      break;
    }
  }

  return next;
}

function isPersistableQueryKey(queryKey: readonly unknown[]) {
  const root = String(queryKey[0] ?? '');

  return [
    'home',
    'home-categories',
    'home-featured-products',
    'home-latest-products',
    'categories',
    'home-products-feed',
    'products',
    'related-products',
    'manufacturers-directory',
    'sellers-module',
    'seller-details',
    'saved-items',
    'chats',
    'chat-details',
  ].includes(root);
}
