// Provide an in-memory AsyncStorage for tests so the Zustand persist
// middleware can hydrate without touching real native storage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Silence the "TaskManager.defineTask is not supported in this context"
// console warning that Expo prints when jest-expo runs without a native bridge.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn().mockReturnValue(false),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn().mockResolvedValue(2),
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
}));
