export abstract class APIProvider {
  abstract init(): Promise<void>;
  abstract completeStream(
    params: any,
    callbacks: {
      onOpen?: (response: any) => void;
      onUpdate?: (completion: any) => void;
      onComplete?: (message: any) => void;
    }
  ): Promise<any>;
}
