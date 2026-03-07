declare module 'react-native-phone-call' {
    export interface PhoneCallParams {
        number: string;
        prompt?: boolean;
    }
    export default function call(args: PhoneCallParams): Promise<void>;
}
