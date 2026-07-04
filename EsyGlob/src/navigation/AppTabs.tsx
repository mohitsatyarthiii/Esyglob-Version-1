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
        const options = descriptors[route.key].options;
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
            accessibilityLabel={options.tabBarAccessibilityLabel}
            key={route.key}
            onPress={onPress}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}>
            {route.name === 'Account' && accountImage ? (
              <View style={[styles.accountBubble, isFocused && styles.accountBubbleActive]}>
                <RemoteImage
                  uri={accountImage}
                  width={72}
                  height={72}
                  style={styles.accountAvatar}
                  fallback={<Text style={[styles.accountInitial, isFocused && styles.accountInitialActive]}>{accountInitial}</Text>}
                />
              </View>
            ) : (
              <View style={[styles.iconBubble, isFocused && styles.activeBubble]}>
                <Icon
                  name={isFocused ? meta.activeIcon : meta.icon}
                  size={24}
                  color={isFocused ? '#fff' : colors.ink}
                />
              </View>
            )}
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
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    ...shadow,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    minHeight: 58,
  },
  tabPressed: {
    opacity: 0.72,
  },
  iconBubble: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 46,
  },
  activeBubble: {
    backgroundColor: colors.primary,
  },
  accountBubble: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 46,
  },
  accountBubbleActive: {
    backgroundColor: colors.primary,
  },
  accountAvatar: {
    borderRadius: radii.pill,
    height: 32,
    width: 32,
  },
  accountInitial: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  accountInitialActive: {
    color: '#fff',
  },
  tabLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  activeLabel: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
});

export default AppTabs;
