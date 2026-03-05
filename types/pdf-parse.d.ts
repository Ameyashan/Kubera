declare module 'pdf-parse/lib/pdf-parse' {
  function parse(dataBuffer: Buffer): Promise<{
    numpages: number
    numrender: number
    info: any
    metadata: any
    text: string
    version: string
  }>
  export default parse
}
