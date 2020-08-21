import React, { useState } from 'react';
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Tabs, Tab, Box } from '@material-ui/core';
import PropTypes from 'prop-types';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`browse-${index}`}
      aria-labelledby={`browse-${index}`}
      {...other}
    >
      <Box>{children}</Box>
    </Typography>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `browse-${index}`,
    'aria-controls': `browse-${index}`,
  };
}

function groupBy(xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x)
    return rv
  }, {})
}

export default function BrowseIndex({ data })  {
    const classes = useStyles();
    const [activeTab, setTab] = useState(0);
    const handleChange = (event, newValue) => {
      setTab(newValue);
    };

    const peopleAlpha = data.neo4j.people.map(person => { return {letter: person.name.charAt(0).toUpperCase(), ...person}});
    const people = groupBy(peopleAlpha, `letter`);

    const placesAlpha = data.neo4j.places.map(place => { return {letter: place.name.charAt(0).toUpperCase(), ...place}});
    const places = groupBy(placesAlpha, `letter`);
    return(
    <Layout>
      <Container maxWidth="md">
        <Box className="sticky-title">
          <Tabs 
            value={activeTab} 
            aria-label="browse tabs"
            onChange={handleChange}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Bible" className={classes.tab}  {...a11yProps(0)}  disableRipple />
            <Tab label="People" className={classes.tab} {...a11yProps(1)} disableRipple />
            <Tab label="Places" className={classes.tab} {...a11yProps(2)} disableRipple />
          </Tabs>
        </Box>
        <TabPanel value={activeTab} index={0} >
          <h1>Books of the Bible</h1>
          {data.neo4j.testaments.map(testament => (
            <>
              <h3>{testament.title}</h3>
              <div className="index-group">
                {testament.books.map(book => (
                  <Link to={`/${book.slug}`} key={book.slug}>{book.title}</Link>
                ))}
              </div>
            </>
          ))}
        </TabPanel>

        <TabPanel value={activeTab} index={1} >
          <h1>All People in the Bible</h1>
          {Object.keys(people).map(letter => (
            <>
              <h3 id={letter}>{letter}</h3>
              <div className="index-group">
                {people[letter].map(person => (
                  <Link key={person.slug} to={`/person/${person.slug}`} className="index-item">{person.name}</Link>
                ))}
              </div>
            </>
          ))}
        </TabPanel>

        <TabPanel value={activeTab} index={2} >
          <h1>All Places in the Bible</h1>
          {Object.keys(places).map(letter => (
            <>
              <h3 id={letter}>{letter}</h3>
              <div className="index-group">
                {places[letter].map(place => (
                  <Link key={place.slug} to={`/place/${place.slug}`} className="index-item">{place.name}</Link>
                ))}
              </div>
            </>
          ))}
        </TabPanel>

      </Container>

      <div className="footer"></div>
    </Layout>
  )
}

export const query = graphql `
  {
    neo4j {
      testaments: Testament (orderBy:title_desc){
        title
        books (orderBy:bookOrder_asc){
          title
          slug
          bookOrder
        }
      }
      people: Person(orderBy: name_asc) {
        name
        slug
        status
      }
      places: Place(orderBy: name_asc) {
        name
        slug
        status
    }
    }
  }
  `

const useStyles = makeStyles(theme => ({
  tab:{
    minWidth:0,
  }
}));
