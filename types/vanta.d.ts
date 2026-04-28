declare module 'vanta/dist/vanta.waves.min' {
  type WavesConfig = {
    el: HTMLElement
    THREE: unknown
    mouseControls?: boolean
    touchControls?: boolean
    color?: number
    shininess?: number
    waveHeight?: number
    waveSpeed?: number
    zoom?: number
    backgroundColor?: number
  }

  type VantaEffect = {
    destroy: () => void
  }

  const WAVES: (config: WavesConfig) => VantaEffect
  export default WAVES
}
