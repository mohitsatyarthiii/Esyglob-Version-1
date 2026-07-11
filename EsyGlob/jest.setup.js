/* eslint-env jest */

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ data: {} }), text: async () => '{}' }));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  return {
    GestureHandlerRootView: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  return {
    FlashList: ({ data = [], renderItem, ListHeaderComponent, ListEmptyComponent }) => React.createElement(
      React.Fragment,
      null,
      typeof ListHeaderComponent === 'function' ? React.createElement(ListHeaderComponent) : ListHeaderComponent,
      data.length ? data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))) : (typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent),
    ),
  };
});

jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: { allFiles: '*/*' } }));
jest.mock('react-native-nitro-sound', () => ({
  __esModule: true,
  default: { startRecorder: jest.fn(), stopRecorder: jest.fn(), pauseRecorder: jest.fn(), resumeRecorder: jest.fn(), startPlayer: jest.fn(), stopPlayer: jest.fn(), addRecordBackListener: jest.fn(), removeRecordBackListener: jest.fn() },
}));
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock('./src/components/AIChatBot', () => {
  const React = require('react');
  return { __esModule: true, default: () => React.createElement(React.Fragment) };
});

jest.mock('react-native', () => {
  const React = require('react');

  const createHost = name => {
    return ({ children, ...props }) => React.createElement(name, props, children);
  };

  class AnimatedValue {
    constructor(value) {
      this.value = value;
    }

    interpolate() {
      return this.value;
    }
  }

  return {
    ActivityIndicator: createHost('ActivityIndicator'),
    AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Animated: {
      Value: AnimatedValue,
      loop: () => ({ start: jest.fn(), stop: jest.fn() }),
      sequence: animations => animations,
      spring: () => ({ start: jest.fn(), stop: jest.fn() }),
      timing: () => ({ start: jest.fn(), stop: jest.fn() }),
      View: createHost('Animated.View'),
    },
    Dimensions: {
      get: () => ({ width: 390, height: 844 }),
    },
    Image: createHost('Image'),
    FlatList: createHost('FlatList'),
    NativeModules: {},
    Platform: {
      OS: 'ios',
      select: values => values.ios || values.default,
    },
    Pressable: createHost('Pressable'),
    RefreshControl: createHost('RefreshControl'),
    ScrollView: createHost('ScrollView'),
    StatusBar: createHost('StatusBar'),
    StyleSheet: {
      create: styles => styles,
      flatten: style => style,
      hairlineWidth: 1,
    },
    Text: createHost('Text'),
    TextInput: createHost('TextInput'),
    View: createHost('View'),
    useColorScheme: () => 'light',
  };
});

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return function MockIcon(props) {
    return React.createElement(Text, props, props.name);
  };
});

jest.mock('react-native-mmkv', () => {
  const data = new Map();

  return {
    createMMKV: () => ({
      getString: key => data.get(key),
      set: (key, value) => data.set(key, String(value)),
      remove: key => data.delete(key),
    }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    emit: jest.fn(() => ({ defaultPrevented: false })),
  };

  return {
    NavigationContainer: ({ children }) => React.createElement(React.Fragment, null, children),
    useNavigation: () => navigation,
    useRoute: () => ({ params: {} }),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');

  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => {
        const screens = React.Children.toArray(children);
        const firstScreen = screens[0];
        const Component = firstScreen?.props?.component;
        return Component ? React.createElement(Component) : null;
      },
      Screen: () => null,
    }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');

  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }) => {
        const screens = React.Children.toArray(children);
        const firstScreen = screens[0];
        const Component = firstScreen?.props?.component;
        return Component ? React.createElement(Component) : null;
      },
      Screen: () => null,
    }),
  };
});

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), {
  virtual: true,
});

jest.mock('react-native/Libraries/Animated/NativeAnimatedTurboModule', () => ({}), {
  virtual: true,
});
