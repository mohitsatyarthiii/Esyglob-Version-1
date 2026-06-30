/* eslint-env jest */

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;

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
    Animated: {
      Value: AnimatedValue,
      loop: () => ({ start: jest.fn(), stop: jest.fn() }),
      sequence: animations => animations,
      timing: () => ({ start: jest.fn(), stop: jest.fn() }),
      View: createHost('Animated.View'),
    },
    Dimensions: {
      get: () => ({ width: 390, height: 844 }),
    },
    Image: createHost('Image'),
    NativeModules: {},
    Platform: {
      OS: 'ios',
      select: values => values.ios || values.default,
    },
    Pressable: createHost('Pressable'),
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
