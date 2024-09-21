/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: "my-ts-app",
			removal: input?.stage === "production" ? "retain" : "remove",
			home: "aws",
			providers: { aws: "6.52.0" },
		};
	},
	async run() {
		const { accountId } = await aws.getCallerIdentity({});
		const role = new aws.iam.Role("DynamoDBPipesSstDemoRole", {
			assumeRolePolicy: JSON.stringify({
				Version: "2012-10-17",
				Statement: {
					Effect: "Allow",
					Action: "sts:AssumeRole",
					Principal: {
						Service: "pipes.amazonaws.com",
					},
					Condition: {
						StringEquals: {
							"aws:SourceAccount": accountId,
						},
					},
				},
			}),
		});
		const sourceTable = new sst.aws.Dynamo("DummyTable", {
			fields: {
				id: { type: "string", primaryKey: true },
				name: { type: "string" },
				expiresAt: { type: "number" },
			},
			primaryIndex: { hashKey: "PK", rangeKey: "SK" },
			ttl: "expiresAt",
			stream: "new_and_old_images",
		});

		const source = new aws.iam.RolePolicy("ReadSource", {
			role: role.id,
			policy: $jsonStringify({
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Action: [
							"dynamodb:DescribeStream",
							"dynamodb:GetRecords",
							"dynamodb:GetShardIterator",
							"dynamodb:ListStreams",
						],
						Resource: [sourceTable.nodes.table.streamArn],
					},
				],
			}),
		});
		// const targetEventBus = new sst.aws.Bus("DummyBus");
		const targetEventBus = new aws.cloudwatch.EventBus("DummyBus", {
			name: "dummy-bus",
		});
		const targetEventBusArn = targetEventBus.arn;
		const target = new aws.iam.RolePolicy("target", {
			role: role.id,
			policy: $jsonStringify({
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Action: ["events:PutEvents"],
						Resource: [targetEventBusArn],
					},
				],
			}),
		});
		new aws.pipes.Pipe(
			"DynamoDBStreamEventBusSstDemoPipe",
			{
				name: "dynamo-db-stream-event-bus-sst-demo-pipe",
				roleArn: role.arn,
				source: sourceTable.arn,
				target: targetEventBusArn,
			},
			{
				dependsOn: [source, target],
			},
		);
	},
});
