// @ts-ignore
import YAML from 'json-to-pretty-yaml';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from 'langchain/schema'
import { useEffect, useState } from 'react';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { useDataProvider } from '../components/data-provider';
import { loadEvaluator } from 'langchain/evaluation';
import { usePlaceOrderAgent } from './usePlaceOrderAgent';

const model = new ChatOpenAI({
	temperature: 1,
	modelName: 'gpt-4-1106-preview',
	openAIApiKey: process.env.REACT_APP_OPENAI_API_KEY,
})

export const useOrderBot = () => {
	const { items } = useDataProvider()
	const { call } = usePlaceOrderAgent();
	const [messages, setMessages] = useState<BaseMessage[]>([
		new SystemMessage(
      `You are OrderBot, an automated service to collect orders for a restraunt.

	1. You first greet the customer, then collect the order.

	2. and then asks the customer for their first name, last name, email address and phone number.

	3. And then you collect the payment method. Payment method can be cash or card.

	You wait to collect the entire order, then summarize it and check for a final \
	time if the customer wants to add anything else.

  Finally ask the user to pick up the order in 20 minutes.

	Some menu items have variants, for example:
	Ravioli Rose Pasta has 2 variants:
	1. Size Choice of Regular or Large
	2. Fettucine Choice of Chicken or Mushroom or Onion.
	Make sure to clarify all variant selections to uniquely identiy items \
	You respond in a short, very conversational friendly style.
	The menu includes \
	${YAML.stringify(
    items.map(
      ({ image, category, createdate, createby, lastupdate, ...item }) => item
    )
  )}
				`
    ),
	])
	const [isLoading, setIsLoading] = useState(false)

	const handleMount = async () => {
		setIsLoading(true);
		const response = await model.generate([[
			...messages,
			new AIMessage('say Hi, you are an OrderBot, say how may I help you?')
		]])

		setMessages(prevState => [
			...prevState,
			new AIMessage(response.generations[0][0].text)
		])
		setIsLoading(false);
	}

	const handleNewMessage = async (newMessage: string) => {
		setIsLoading(true);
		const tmpMessages = [		
			...messages,
			new HumanMessage(newMessage)
		];
		setMessages(tmpMessages);
		const response = await model.generate([tmpMessages])
		const latestAiMessage = response.generations[0][0].text;
		setMessages([
			...tmpMessages,
			new AIMessage(latestAiMessage)
		])
		setIsLoading(false);
		const evaluator = await loadEvaluator('criteria', {
			llm: model,
			criteria: {
				name: "orderPlacingCheck",
				critiqueRequest:
					"Identify specific ways in which the assistant’s last response is asking to pick up the order in 20 mins",
			}
		})
		const evaluatorResponse = await evaluator.evaluateStrings({
			input: "message",
			prediction: latestAiMessage,
		})

		if (evaluatorResponse.score) {
			const response = await model.generate([[
				...tmpMessages,
				new AIMessage(latestAiMessage),
				new AIMessage(`Summarize the customer's order, personal information and payment method perferrance. Include menu item name, price, quantity, and variants. For variants include the variant title, the selected option and variant selection price. 

				Desired output For example:
				${YAML.stringify({
					name: 'Azim Ahmed',
					phone: '9999999999',
					email: 'ximxim@ximxim.ca',
					paymentMethod: 'cash',
					orderSummary: [
						{ item: '2x Apple juice: $4.98' },
						{ item: '1x Build your own pizza: $7.99', choices: [
							{ type: 'Size', choice: 'Large', price: '$5.00' },
							{ type: 'Crust', choice: 'Thick' },
							{ type: 'Toppings', choice: [
								{ label: 'No cheese' },
								{ label: 'Chicken', price: '$2.25' },
								{ label: 'Mushrooms', price: '$2.25' },
							] },
						] },
					]
				})}
				`),
			]]);

			await call(response.generations[0][0].text)
		}
	}

	useEffect(() => {
		handleMount();
	}, [])

	return { messages, handleNewMessage, isLoading };
}
