import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AccountScreen from '../screens/AccountScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import HomeScreen from '../screens/HomeScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ServicesScreen from '../screens/ServicesScreen';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { colors, radii, shadow, spacing } from '../theme';
import { firstImage } from '../utils/images';

export type RootTabParamList = {
  Home: undefined;
  Categories: undefined;
  Services: undefined;
  Messages: undefined;
  Account: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const tabMeta: Record<keyof RootTabParamList, { icon: string; activeIcon: string; label: string }> = {
  Home: { icon: 'home-outline', activeIcon: 'home', label: 'Home' },
  Categories: { icon: 'view-grid-outline', activeIcon: 'view-grid', label: 'Categories' },
  Services: { icon: 'briefcase-outline', activeIcon: 'briefcase', label: 'Services' },
  Messages: { icon: 'message-text-outline', activeIcon: 'message-text', label: 'Messenger' },
  Account: { icon: 'account-outline', activeIcon: 'account', label: 'My EsyGlob' },
};

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const accountImage = status === 'authenticated' ? firstImage(user?.profileImage, user?.avatar, user?.image) : null;
  const accountInitial = (user?.name ?? user?.fullName ?? user?.email ?? 'E').slice(0, 1).toUpperCase();

  return (
    <View style={[styles.tabShell, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const meta = tabMeta[route.name as keyof RootTabParamList];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={meta.label}
            key={route.key}
            onPress={onPress}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}>
            
            {/* Active Indicator Line */}
            {isFocused && <View style={styles.activeIndicator} />}
            
            {/* Icon */}
            {route.name === 'Account' && accountImage ? (
              <View style={styles.accountIconWrap}>
                <RemoteImage
                  uri={accountImage}
                  width={62}
                  height={62}
                  style={[styles.accountAvatar, isFocused && styles.accountAvatarActive]}
                  fallback={
                    <View style={[styles.accountFallback, isFocused && styles.accountFallbackActive]}>
                      <Text style={[styles.accountInitial, isFocused && styles.accountInitialActive]}>
                        {accountInitial}
                      </Text>
                    </View>
                  }
                />
              </View>
            ) : (
              <View style={styles.iconWrap}>
                <Icon
                  name={isFocused ? meta.activeIcon : meta.icon}
                  size={20}
                  color={isFocused ? '#EA580C' : colors.ink}
                />
              </View>
            )}
            
            {/* Label */}
            <Text numberOfLines={1} style={[styles.tabLabel, isFocused && styles.activeLabel]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function renderTabBar(props: BottomTabBarProps) {
  return <CustomTabBar {...props} />;
}

function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Categories" component={CategoriesScreen} />
      <Tab.Screen name="Services" component={ServicesScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabShell: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    paddingHorizontal: spacing.xs,
    paddingTop: 0,
    position: 'absolute',
    right: 0,
    ...shadow,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 56,
    position: 'relative',
  },
  tabPressed: {
    opacity: 0.8,
  },
  
  // Active Indicator Line (Top)
  activeIndicator: {
    position: 'absolute',
    top: 0,
    height: 3,
    width: 32,
    backgroundColor: '#EA580C',
    borderRadius: 2,
    alignSelf: 'center',
  },
  
  // Icon Wrapper
  iconWrap: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  
  // Account Icon
  accountIconWrap: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  accountAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.faint,
  },
  accountAvatarActive: {
    borderColor: '#EA580C',
    borderWidth: 2,
  },
  accountFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.faint,
  },
  accountFallbackActive: {
    borderColor: '#EA580C',
    borderWidth: 2,
    backgroundColor: '#FFF7ED',
  },
  accountInitial: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  accountInitialActive: {
    color: '#EA580C',
  },
  
  // Label
  tabLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  activeLabel: {
    color: '#EA580C',
    fontWeight: '700',
  },
});

export default AppTabs;