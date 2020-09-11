import { EMPTY_OBJ, EMPTY_ARR } from '../constants';
import { Component } from '../component';
import { Fragment } from '../create-element';
import { diffChildren, placeChild } from './children';
import { diffProps, setProperty } from './props';
import { assign, removeNode } from '../util';
import options from '../options';

function reorderChildren(newVNode, oldDom, parentDom) {
	for (let tmp = 0; tmp < newVNode._children.length; tmp++) {
		const vnode = newVNode._children[tmp];
		if (vnode) {
			vnode._parent = newVNode;

			if (vnode._dom) {
				if (typeof vnode.type == 'function' && vnode._children.length > 1) {
					reorderChildren(vnode, oldDom, parentDom);
				}

				oldDom = placeChild(
					parentDom,
					vnode,
					vnode,
					newVNode._children,
					null,
					vnode._dom,
					oldDom
				);

				if (typeof newVNode.type == 'function') {
					newVNode._nextDom = oldDom;
				}
			}
		}
	}
}

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * @param {import('../internal').PreactElement} parentDom The parent of the DOM element
 * @param {import('../internal').VNode} newVNode The new virtual node
 * @param {import('../internal').VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object. Modified by getChildContext
 * @param {boolean} isSvg Whether or not this element is an SVG node
 * @param {Array<import('../internal').PreactElement>} excessDomChildren
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {Element | Text} oldDom The current attached DOM
 * element any new dom elements should be placed around. Likely `null` on first
 * render (except when hydrating). Can be a sibling DOM element when diffing
 * Fragments that have siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} [isHydrating] Whether or not we are in hydration
 * 
 * */

export function diff(
	                  ////  首次
	parentDom,         //#root
	newVNode,          //vnode 
					   //	  === { type: fragment, props: { ..., childern: [vnode] 实际要渲染的vnode }, }
	oldVNode,          //EMPTY_OBJ
	globalContext,     //EMPTY_OBJ, 
	isSvg,             //false
	excessDomChildren, //undefined
	commitQueue,       //[],
	oldDom,            //EMPTY_OBJ
	isHydrating,       //false
) {
	let tmp,
		newType = newVNode.type;      //首次是Fragment 函数  //再次就是 组件的构造函数

	// When passing through createElement it assigns the object
	// constructor as undefined. This to prevent JSON-injection.
	if (newVNode.constructor !== undefined) return null;  //不是有效的element

	if ((tmp = options._diff)) tmp(newVNode);

	try {
		// 如果新的Vnode.type 是函数,说明是组件（纯组件和class组件）,  首次diff, 是 Fragment 函数
		outer: if (typeof newType == 'function') {
			let c, isNew, oldProps, oldState, snapshot, clearProcessingException;
			let newProps = newVNode.props;

			// Necessary for createContext api. Setting this property will pass
			// the context value as `this.context` just for this component.
			/**Context处理部分 */
			tmp = newType.contextType;       // 如果是 context.Consumer组件，则tmp即为context
																				// 如果是 context.Provider组件，则tmp即为undefined
																				// class组件中如果使用context，会有contextType值，tmp ==> context
																				// 函数组件，其中如果使用context，即consumer，consumer默认有该属性值 
			let provider = tmp && globalContext[tmp._id];   //初次渲染 undefined
			// 如果组件使用了context，componentContext为对应context的value，否则为参数globalContext的值，首次为空对象{}
			let componentContext = tmp                      // 初次{}
				? provider
					? provider.props.value    //如果proverder 有value属性就消费value值
					: tmp._defaultValue       // 只有匹配不到procider时才使用 _defaultValue
				: globalContext;  

			// Get component and set it to `c`
			// 实例化组件
			if (oldVNode._component) { //首次为undefined
				c = newVNode._component = oldVNode._component;
				clearProcessingException = c._processingException = c._pendingError;
			} else {
				// Instantiate the new component
				// vnode没有组件实例，则实例化组件
				// 函数组件的 prototype,是没有render属性的
				// class组件,底层也是函数, 在jsx编译过程中 会对 该函数的prototype用difineproperty 
				// 添加render属性,值即为 class中定义的render()函数
				if ('prototype' in newType && newType.prototype.render) {
					//自定义class组件 即继承了Component
					newVNode._component = c = new newType(newProps, componentContext); // eslint-disable-line new-cap
				} else {
					// 函数组件,或者字符串(html元素) 先用 Component 构造一个组件对象c
					newVNode._component = c = new Component(newProps, componentContext);
					c.constructor = newType;   //将函数组件实例的constructor指向对应函数newType， 默认指向函数Component
					c.render = doRender;     //给函数组件实例设置一个render函数
				}
				if (provider) provider.sub(c);  //如果组件实例使用了context，也有对应的provider组件，则provider的subs数组中添加该组件实例c

				c.props = newProps;
				if (!c.state) c.state = {};
				c.context = componentContext;  //context值
				c._globalContext = globalContext;   
				isNew = c._dirty = true;
				c._renderCallbacks = [];
			}

			// Invoke getDerivedStateFromProps
			if (c._nextState == null) {
				c._nextState = c.state;
			}
			// getDerivedStateFromProps，在render方法之前，而且初次和后续更新都会调用
			if (newType.getDerivedStateFromProps != null) {
				if (c._nextState == c.state) {
					c._nextState = assign({}, c._nextState);
				}

				assign(
					c._nextState,
					newType.getDerivedStateFromProps(newProps, c._nextState)
				);
			}

			oldProps = c.props;
			oldState = c.state;

			// Invoke pre-render lifecycle methods
			if (isNew) {///首次渲染时执行
				if (
					newType.getDerivedStateFromProps == null &&
					c.componentWillMount != null
				) {
					c.componentWillMount();
				}

				if (c.componentDidMount != null) {
					c._renderCallbacks.push(c.componentDidMount);
				}
			} else {// 更新时才会执行
				if (
					newType.getDerivedStateFromProps == null &&
					newProps !== oldProps &&
					c.componentWillReceiveProps != null
				) {
					c.componentWillReceiveProps(newProps, componentContext);
				}

				if (
					(!c._force &&
						c.shouldComponentUpdate != null &&
						c.shouldComponentUpdate(
							newProps,
							c._nextState,
							componentContext
						) === false) ||
					newVNode._original === oldVNode._original
				) { //重新渲染时, 如果新旧vNode相同 或者 shouldComponentUpdate为fals时，跳过render调用，以及子节点的diff， 191行
					c.props = newProps;
					c.state = c._nextState;
					// More info about this here: https://gist.github.com/JoviDeCroock/bec5f2ce93544d2e6070ef8e0036e4e8
					if (newVNode._original !== oldVNode._original) c._dirty = false;
					c._vnode = newVNode;
					newVNode._dom = oldVNode._dom;
					newVNode._children = oldVNode._children;
					if (c._renderCallbacks.length) {
						commitQueue.push(c);
					}

					reorderChildren(newVNode, oldDom, parentDom);
					break outer;
				}

				if (c.componentWillUpdate != null) {
					c.componentWillUpdate(newProps, c._nextState, componentContext);
				}

				if (c.componentDidUpdate != null) {
					c._renderCallbacks.push(() => {
						c.componentDidUpdate(oldProps, oldState, snapshot);
					});
				}
			}

			c.context = componentContext;
			c.props = newProps;
			c.state = c._nextState;

			if ((tmp = options._render)) tmp(newVNode);   // 首次render也要调用 useEffect

			c._dirty = false;
			c._vnode = newVNode;
			c._parentDom = parentDom;
			
			
			tmp = c.render(c.props, c.state, c.context);
																//首次，为顶层fragment，返回props.children, 即为[App]   
																//函数组件返回return中的jsx, 即React.createElement(jsx)====vnode
														   //class组件,相当于调用render函数,结果为render函数的return值,即为jsx===vnode
														   // context.summer和 provider 都会返回child
			// Handle setState called in render, see #2553
			c.state = c._nextState;

			// context.provider组件,具有该属性，获取到ctx 对象
			// 每次createContext都会有一个ctx变量 === {ctxId: createContext的结果},
			// 所以出现provider组件就会有对应context存入ctx对象，即globalContext
			if (c.getChildContext != null) {
				//所以没出现一个provider就会将其对应的context添加到globalContext中
				globalContext = assign(assign({}, globalContext), c.getChildContext());
			}

			if (!isNew && c.getSnapshotBeforeUpdate != null) {
				snapshot = c.getSnapshotBeforeUpdate(oldProps, oldState);
			}

			let isTopLevelFragment =
				tmp != null && tmp.type == Fragment && tmp.key == null;
			let renderResult = isTopLevelFragment ? tmp.props.children : tmp;   //如果组件渲染结果最顶层为Fragment,则使用children作为render的结果

			diffChildren(
									// 首次
				parentDom,          // #root
				Array.isArray(renderResult) ? renderResult : [renderResult], // [vnode]
				newVNode,          // vnode
				oldVNode,          // EMPTY_OBJ
				globalContext,     //EMPTY_OBJ 
				isSvg,             // false
				excessDomChildren, // undefined
				commitQueue,       // []
				oldDom,		       // EMPTY_OBJ
				isHydrating        // false
			);

			c.base = newVNode._dom;

			if (c._renderCallbacks.length) {
				commitQueue.push(c);
			}

			if (clearProcessingException) {
				c._pendingError = c._processingException = null;
			}

			c._force = false;
		}
		// 如果新的Vnode.type 不是函数, 即普通HtmlElement
		else if (		
			excessDomChildren == null &&
			newVNode._original === oldVNode._original
		) {
			//_original代表自身 // 如果newVNode === oldVNode 将旧的_children 和 _dom 赋给新节点
			newVNode._children = oldVNode._children;
			newVNode._dom = oldVNode._dom;
		} else {
			// 如果newVNode !== oldVNode 
			// newVNode._dom为diffElementNodes的结果
			newVNode._dom = diffElementNodes(
				oldVNode._dom,
				newVNode,
				oldVNode,
				globalContext,
				isSvg,
				excessDomChildren,
				commitQueue,
				isHydrating
			);
		}

		if ((tmp = options.diffed)) tmp(newVNode);   //会调用newVnode的组件hook的useEffect的callback
	} catch (e) {
		newVNode._original = null;
		options._catchError(e, newVNode, oldVNode);
	}

	return newVNode._dom;
}

/**
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').VNode} root
 */
export function commitRoot(commitQueue, root) {
	if (options._commit) options._commit(root, commitQueue);

	commitQueue.some(c => {
		try {
			commitQueue = c._renderCallbacks;
			c._renderCallbacks = [];
			commitQueue.some(cb => {
				cb.call(c);
			});
		} catch (e) {
			options._catchError(e, c._vnode);
		}
	});
}

/**
 * Diff two virtual nodes representing DOM element
 * @param {import('../internal').PreactElement} dom The DOM element representing
 * the virtual nodes being diffed
 * @param {import('../internal').VNode} newVNode The new virtual node
 * @param {import('../internal').VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {*} excessDomChildren
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @returns {import('../internal').PreactElement}
 */
function diffElementNodes(
	dom,
	newVNode,
	oldVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	isHydrating
) {
	let i;
	let oldProps = oldVNode.props;
	let newProps = newVNode.props;

	// Tracks entering and exiting SVG namespace when descending through the tree.
	isSvg = newVNode.type === 'svg' || isSvg;

	if (excessDomChildren != null) {
		for (i = 0; i < excessDomChildren.length; i++) {
			const child = excessDomChildren[i];

			// if newVNode matches an element in excessDomChildren or the `dom`
			// argument matches an element in excessDomChildren, remove it from
			// excessDomChildren so it isn't later removed in diffChildren
			if (
				child != null &&
				((newVNode.type === null
					? child.nodeType === 3
					: child.localName === newVNode.type) ||
					dom == child)
			) {
				dom = child;
				excessDomChildren[i] = null;
				break;
			}
		}
	}

	if (dom == null) {
		if (newVNode.type === null) {
			return document.createTextNode(newProps);
		}

		dom = isSvg
			? document.createElementNS('http://www.w3.org/2000/svg', newVNode.type)
			: document.createElement(
					newVNode.type,
					newProps.is && { is: newProps.is }
			  );
		// we created a new parent, so none of the previously attached children can be reused:
		excessDomChildren = null;
		// we are creating a new node, so we can assume this is a new subtree (in case we are hydrating), this deopts the hydrate
		isHydrating = false;
	}

	if (newVNode.type === null) {
		if (oldProps !== newProps && dom.data !== newProps) {
			dom.data = newProps;
		}
	} else {
		if (excessDomChildren != null) {
			excessDomChildren = EMPTY_ARR.slice.call(dom.childNodes);
		}

		oldProps = oldVNode.props || EMPTY_OBJ;

		let oldHtml = oldProps.dangerouslySetInnerHTML;
		let newHtml = newProps.dangerouslySetInnerHTML;

		// During hydration, props are not diffed at all (including dangerouslySetInnerHTML)
		// @TODO we should warn in debug mode when props don't match here.
		if (!isHydrating) {
			// But, if we are in a situation where we are using existing DOM (e.g. replaceNode)
			// we should read the existing DOM attributes to diff them
			if (excessDomChildren != null) {
				oldProps = {};
				for (let i = 0; i < dom.attributes.length; i++) {
					oldProps[dom.attributes[i].name] = dom.attributes[i].value;
				}
			}

			if (newHtml || oldHtml) {
				// Avoid re-applying the same '__html' if it did not changed between re-render
				if (!newHtml || !oldHtml || newHtml.__html != oldHtml.__html) {
					dom.innerHTML = (newHtml && newHtml.__html) || '';
				}
			}
		}

		diffProps(dom, newProps, oldProps, isSvg, isHydrating);

		// If the new vnode didn't have dangerouslySetInnerHTML, diff its children
		if (newHtml) {
			newVNode._children = [];
		} else {
			i = newVNode.props.children;
			diffChildren(
				dom,
				Array.isArray(i) ? i : [i],
				newVNode,
				oldVNode,
				globalContext,
				newVNode.type === 'foreignObject' ? false : isSvg,
				excessDomChildren,
				commitQueue,
				EMPTY_OBJ,
				isHydrating
			);
		}

		// (as above, don't diff props during hydration)
		if (!isHydrating) {
			if (
				'value' in newProps &&
				(i = newProps.value) !== undefined &&
				i !== dom.value
			) {
				setProperty(dom, 'value', i, oldProps.value, false);
			}
			if (
				'checked' in newProps &&
				(i = newProps.checked) !== undefined &&
				i !== dom.checked
			) {
				setProperty(dom, 'checked', i, oldProps.checked, false);
			}
		}
	}

	return dom;
}

/**
 * Invoke or update a ref, depending on whether it is a function or object ref.
 * @param {object|function} ref
 * @param {any} value
 * @param {import('../internal').VNode} vnode
 */
export function applyRef(ref, value, vnode) {
	try {
		if (typeof ref == 'function') ref(value);
		else ref.current = value;
	} catch (e) {
		options._catchError(e, vnode);
	}
}

/**
 * Unmount a virtual node from the tree and apply DOM changes
 * @param {import('../internal').VNode} vnode The virtual node to unmount
 * @param {import('../internal').VNode} parentVNode The parent of the VNode that
 * initiated the unmount
 * @param {boolean} [skipRemove] Flag that indicates that a parent node of the
 * current element is already detached from the DOM.
 */
export function unmount(vnode, parentVNode, skipRemove) {
	let r;
	if (options.unmount) options.unmount(vnode);

	if ((r = vnode.ref)) {
		if (!r.current || r.current === vnode._dom) applyRef(r, null, parentVNode);
	}

	let dom;
	if (!skipRemove && typeof vnode.type != 'function') {
		skipRemove = (dom = vnode._dom) != null;
	}

	// Must be set to `undefined` to properly clean up `_nextDom`
	// for which `null` is a valid value. See comment in `create-element.js`
	vnode._dom = vnode._nextDom = undefined;

	if ((r = vnode._component) != null) {
		if (r.componentWillUnmount) {
			try {
				r.componentWillUnmount();
			} catch (e) {
				options._catchError(e, parentVNode);
			}
		}

		r.base = r._parentDom = null;
	}

	if ((r = vnode._children)) {
		for (let i = 0; i < r.length; i++) {
			if (r[i]) unmount(r[i], parentVNode, skipRemove);
		}
	}

	if (dom != null) removeNode(dom);
}

/** The `.render()` method for a PFC backing instance. */
function doRender(props, state, context) {
	return this.constructor(props, context);
}
