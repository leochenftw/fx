// @ts-ignore
import cdkExports from '../../cdk/cdk-exports.json';

export const cognitoConfig = {
  UserPoolId: cdkExports.CdkStack.UserPoolId as string,
  ClientId: cdkExports.CdkStack.UserPoolClientId as string,
  OrgsApiUrl: cdkExports.CdkStack.OrgsApiUrl as string,
};
