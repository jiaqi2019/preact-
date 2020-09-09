import { EMPTY_OBJ, EMPTY_ARR } from './constants';
import { commitRoot, diff } from './diff/index';
import { createElement, Fragment } from './create-element';
import options from './options';

const IS_HYDRATE = EMPTY_OBJ;

/**
 * Render a Preact virtual node into a DOM element
 * @param {import('./index').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * render into
 * @param {Element | Text} [replaceNode] Optional: Attempt to re-use an
 * existing DOM tree rooted at `replaceNode`
 */
export function render(vnode, parentDom, replaceNode) {
	if (options._root) options._root(vnode, parentDom);

	// We abuse the `replaceNode` parameter in `hydrate()` to signal if we
	// are in hydration mode or not by passing `IS_HYDRATE` instead of a
	// DOM element.
	let isHydrating = replaceNode === IS_HYDRATE;  //空对象

	// To be able to support calling `render()` multiple times on the same
	// DOM node, we need to obtain a reference to the previous tree. We do
	// this by assigning a new `_children` property to DOM nodes which points
	// to the last rendered tree. By default this property is not present, which
	// means that we are mounting a new tree for the first time.
	
	// _children指向 DOM节点, Vnode
	// 首次渲染时值为 #root._children ===> undefined
	let oldVNode = isHydrating  //第一次是false, replaceNode为空,所以是parentDom._children
		? null
		: (replaceNode && replaceNode._children) || parentDom._children;
	// 根据
	// createElement(type, props, children) 
	// 返回一个Vnode
	// return createVNode(
		// 	type,
		// 	normalizedProps, //包含了children
		// 	props && props.key,  
		// 	props && props.ref,
		// 	null
	// );
	/*
		Fragment(props) {
			return props.children;
		}
	*/
	vnode = createElement(Fragment, null, [vnode]);

	// List of effects that need to be called after diffing.
	let commitQueue = [];
	/*diff(	parentDom, newVNode, oldVNode, globalContext,isSvg, excessDomChildren,commitQueue,oldDom,isHydrating)*/
	//diff( #root,      vnode,   EMPTY_OBJ, EMPTY_OBJ,   false,  undefined,           [],         EMPTY_OBJ, false     )
	// 					#root._children = vnode, 首次
	diff(
		parentDom, // 挂载的节点#root
		// Determine the new vnode tree and store it on the DOM element on
		// our custom `_children` property.
		((isHydrating ? parentDom : replaceNode || parentDom)._children = vnode),
		oldVNode || EMPTY_OBJ,
		EMPTY_OBJ,
		parentDom.ownerSVGElement !== undefined,
		replaceNode && !isHydrating
			? [replaceNode]
			: oldVNode
			? null
			: parentDom.childNodes.length
			? EMPTY_ARR.slice.call(parentDom.childNodes)
			: null,
		commitQueue,
		replaceNode || EMPTY_OBJ,
		isHydrating
	);

	// Flush all queued effects
	commitRoot(commitQueue, vnode);
}

/**
 * Update an existing DOM element with data from a Preact virtual node
 * @param {import('./index').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * update
 */
export function hydrate(vnode, parentDom) {
	render(vnode, parentDom, IS_HYDRATE);
}
