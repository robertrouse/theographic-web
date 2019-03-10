import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'

// Taken from https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects?rq=1
const groupBy = function (xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x)
    return rv
  }, {})
}

function LinkList(props) {
  const letterData = props.letterData;
  const alphaGroup = letterData[0].firstLetter;
  const letterList = letterData.map((letter, i) => {
    if (letter.status === 'wip') {
      return <span className="index-item">{letter.name}</span>
    } else {
      return <Link key={i} to={`/place/${letter.slug}`} className="index-item">{letter.name}</Link>
    }
  }
  );
  return (
    <div>
      <h3 className="sticky-sub" id={alphaGroup}>{alphaGroup}</h3>
      <div className="index-group">{letterList}</div>
    </div>
  )
}

function AlphaList(props) {
  const letterData = props.letters.Place;
  const listAlpha = letterData.map(place => { return {firstLetter: place.name.charAt(0).toUpperCase(), ...place}});
  const letters = groupBy(listAlpha, `firstLetter`);
  return Object.keys(letters).map((letter, i) => <LinkList key={i} letterData={letters[letter]} />)
}

class PlacesPage extends React.Component {

  render() {
    const { data } = this.props
    return (
      <Layout>
        <div className="container">
          <h1 className="sticky-title">All Places in the Bible</h1>
          <AlphaList letters={data.neo4j} />
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default PlacesPage

export const query = graphql`
{
  neo4j {
    Place(orderBy: name_asc) {
      name
      slug
      status
    }
  }
}
`