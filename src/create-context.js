import { enqueueRender } from './component';

export let i = 0;

export function createContext(defaultValue) {
	const ctx = {};   //即为globalContext，所有provider组件通过调用getChildContext函数，将自己保存再ctx
					  // provider组件下的所有子组件c，都有_globalContext属性 ===> 值为ctx
					  // 子组件c的context属性，为context的defaultValue，或者 属性value值，
					  //这也是为什么class组件可以用this.context访问context的值 src/diff/index 93, 94,119行
	const context = {
		_id: '__cC' + i++,
		_defaultValue: defaultValue,
		Consumer(props, context) {
			// 对于函数组件中使用consumer的方式，其子元素为函数（这是语法）
			// 经过jsx模板编译后，vnode的children是一个函数，如下
			// React.createElement(
			// 	ThemeContext.consumer,
			// 	null,
			// 	function (value) {
			// 		return React.createElement(
			// 			'h1',
			// 			null,
			// 			value
			// 		);
			// 	}
			// )后，props.children即为vnode的children，是一个函数
			//下面直接调用，并将context====>_defaultValue传入，因此再diff中 会new consumer组件，返回相应的内容
			// 详见 src/diff/index 86-92行， 105，108行
			return props.children(context);
		},
		Provider(props) {
			if (!this.getChildContext) {
				const subs = [];

				//详见src/diff/index 216--218行
				this.getChildContext = () => {
					ctx[context._id] = this;
					return ctx;
				};

				this.shouldComponentUpdate = _props => {
					// 属性value变化时，就会触发subs中子组件的更新
					if (this.props.value !== _props.value) {
						subs.some(c => {
							c.context = _props.value;
							enqueueRender(c);
						});
					}
				};
				
				//diff算法中，会 new 一个组件实例c，并调用该方法，将c作为参数传入
				// this为porvider, c为子组件
				this.sub = c => {
					subs.push(c);
					let old = c.componentWillUnmount;
					// 组件c卸载签，从subs中删去
					c.componentWillUnmount = () => {
						subs.splice(subs.indexOf(c), 1);
						old && old.call(c);
					};
				};
			}
			return props.children;
		}
	};

	context.Consumer.contextType = context;

	// Devtools needs access to the context object when it
	// encounters a Provider. This is necessary to support
	// setting `displayName` on the context object instead
	// of on the component itself. See:
	// https://reactjs.org/docs/context.html#contextdisplayname
	context.Provider._contextRef = context;

	return context;
}
