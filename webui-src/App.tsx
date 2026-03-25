import { AppRuntimeProvider } from './app-runtime/AppRuntimeProvider.js'
import { AppSurfaceRoots } from './app-runtime/AppSurfaceRoots.js'

export const App = () => (
  <AppRuntimeProvider>
    <AppSurfaceRoots />
  </AppRuntimeProvider>
)
