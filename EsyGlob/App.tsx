import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/auth/AuthContext';
import AppTabs from './src/navigation/AppTabs';
import ChatDetailsScreen from './src/screens/ChatDetailsScreen';
import ProductDetailsScreen from './src/screens/ProductDetailsScreen';
import QuotationDetailsScreen from './src/screens/QuotationDetailsScreen';
import RFQDetailsScreen from './src/screens/RFQDetailsScreen';
import SearchScreen from './src/screens/SearchScreen';
import SellerDetailsScreen from './src/screens/SellerDetailsScreen';
import OrderCheckoutScreen from './src/screens/OrderCheckoutScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import SellerFactoryScreen from './src/screens/SellerFactoryScreen';
import SellerOnboardingScreen from './src/screens/SellerOnboardingScreen';
import SellerProductFormScreen from './src/screens/SellerProductFormScreen';
import SellerProductsScreen from './src/screens/SellerProductsScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  ProductDetails: { productId: string };
  ProductListing: { category?: string; categoryName?: string; q?: string; seller?: string; sellerName?: string } | undefined;
  SellerDetails: { sellerId: string; sellerName?: string };
  ChatDetails: { chatId: string; title?: string };
  RFQDetails: { rfqId: string };
  QuotationDetails: { quotationId: string };
  OrderCheckout: { mode: 'sample' | 'trade'; productId?: string; chatId?: string; quotationId?: string };
  Orders: undefined;
  OrderDetails: { orderId: string };
  SellerOnboarding: undefined;
  SellerFactory: undefined;
  SellerProducts: undefined;
  SellerProductForm: { productId?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <StatusBar
            translucent
            backgroundColor="transparent"
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          />
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="MainTabs" component={AppTabs} />
              <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
              <Stack.Screen name="ProductListing" component={SearchScreen} />
              <Stack.Screen name="SellerDetails" component={SellerDetailsScreen} />
              <Stack.Screen name="ChatDetails" component={ChatDetailsScreen} />
              <Stack.Screen name="RFQDetails" component={RFQDetailsScreen} />
              <Stack.Screen name="QuotationDetails" component={QuotationDetailsScreen} />
              <Stack.Screen name="OrderCheckout" component={OrderCheckoutScreen} />
              <Stack.Screen name="Orders" component={OrdersScreen} />
              <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
              <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} />
              <Stack.Screen name="SellerFactory" component={SellerFactoryScreen} />
              <Stack.Screen name="SellerProducts" component={SellerProductsScreen} />
              <Stack.Screen name="SellerProductForm" component={SellerProductFormScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
